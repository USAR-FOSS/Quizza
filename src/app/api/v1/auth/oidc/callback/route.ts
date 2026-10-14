import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSessionCookie, oidcEnabled } from "@/lib/auth";

function fail(req: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));
}

export async function GET(req: NextRequest) {
  if (!oidcEnabled()) return fail(req, "oidc_unavailable");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expectedState = jar.get("oidc_state")?.value;
  const verifier = jar.get("oidc_verifier")?.value;
  const expectedNonce = jar.get("oidc_nonce")?.value;
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return fail(req, "oidc_state");
  }

  const issuer = process.env.OIDC_ISSUER || "https://oidc.fossclub.tech";
  const clientId = process.env.OIDC_CLIENT_ID as string;
  const clientSecret = process.env.OIDC_CLIENT_SECRET as string;
  const redirectUri = `${url.origin}/api/v1/auth/oidc/callback`;

  // Everything below can touch the network and the database; a failure here must
  // produce a clean redirect with a reason, never an opaque 500.
  try {
    // client_secret_basic: credentials in the Authorization header (provider
    // default, see docs/oidc.md). Only the code and PKCE verifier are in the body.
    const basic = Buffer.from(
      `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`,
    ).toString("base64");
    const tokenRes = await fetch(`${issuer}/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
    if (!tokenRes.ok) {
      console.error("[oidc] token endpoint error", tokenRes.status, await safeText(tokenRes));
      return fail(req, "oidc_token");
    }

    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) return fail(req, "oidc_no_id");

    const jwks = createRemoteJWKSet(new URL(`${issuer}/jwks`));
    let claims: Record<string, unknown>;
    try {
      const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer, audience: clientId });
      claims = payload as Record<string, unknown>;
    } catch (err) {
      console.error("[oidc] id_token verification failed", err);
      return fail(req, "oidc_verify");
    }

    // Bind the ID token to this sign-in attempt (replay protection).
    if (!expectedNonce || claims.nonce !== expectedNonce) {
      return fail(req, "oidc_nonce");
    }

    const sub = typeof claims.sub === "string" ? claims.sub : null;
    if (!sub) return fail(req, "oidc_no_sub");
    const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
    const name =
      (typeof claims.name === "string" && claims.name) ||
      (typeof claims.preferred_username === "string" && claims.preferred_username) ||
      "Host";
    const picture = typeof claims.picture === "string" ? claims.picture : null;

    // Resolve the account: by OIDC subject first, then by email (so a FOSSClub
    // sign-in links to an existing email/password account instead of colliding
    // on the unique email).
    let account = (
      await db.select().from(users).where(eq(users.subject, sub)).limit(1)
    )[0];
    if (!account && email) {
      account = (
        await db.select().from(users).where(eq(users.email, email)).limit(1)
      )[0];
    }

    let userId: string;
    if (account) {
      userId = account.id;
      await db
        .update(users)
        .set({ subject: sub, email: email ?? account.email, name, avatarUrl: picture ?? account.avatarUrl })
        .where(eq(users.id, userId));
    } else {
      const [u] = await db
        .insert(users)
        .values({ subject: sub, email, name, avatarUrl: picture })
        .returning();
      userId = u.id;
    }

    await createSessionCookie(userId);
    jar.delete("oidc_verifier");
    jar.delete("oidc_state");
    jar.delete("oidc_nonce");
    return NextResponse.redirect(new URL("/dashboard", req.url));
  } catch (err) {
    console.error("[oidc] callback failed", err);
    return fail(req, "oidc_error");
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
