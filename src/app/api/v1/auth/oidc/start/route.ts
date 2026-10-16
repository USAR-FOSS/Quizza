import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { oidcEnabled } from "@/lib/auth";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(req: NextRequest) {
  if (!oidcEnabled()) {
    return NextResponse.redirect(new URL("/login?error=oidc_unavailable", req.url));
  }
  const issuer = process.env.OIDC_ISSUER || "https://oidc.fossclub.tech";
  const clientId = process.env.OIDC_CLIENT_ID as string;
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/v1/auth/oidc/callback`;

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));
  const nonce = b64url(randomBytes(16));

  const jar = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  jar.set("oidc_verifier", verifier, opts);
  jar.set("oidc_state", state, opts);
  jar.set("oidc_nonce", nonce, opts);

  const auth = new URL(`${issuer}/auth`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  // "club" releases the member and role claims; harmless for non-members.
  auth.searchParams.set("scope", "openid profile email club");
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("state", state);
  auth.searchParams.set("nonce", nonce);

  return NextResponse.redirect(auth.toString());
}
