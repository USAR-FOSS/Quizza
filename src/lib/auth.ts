import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Host authentication. Participants are anonymous and never touch this.
 * Sessions are a signed JWT in an httpOnly cookie. Passwords use scrypt from the
 * Node crypto module, so there is no native dependency.
 */

const COOKIE = "quizza_session";
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-insecure-secret-change-me",
);

export type SessionUser = typeof users.$inferSelect;

/* ------------------------------ passwords --------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ------------------------------ session ----------------------------- */

export async function createSessionCookie(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const id = typeof payload.sub === "string" ? payload.sub : null;
    if (!id) return null;
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return u ?? null;
  } catch {
    return null;
  }
}

/** Whether OIDC sign-in is configured on this instance. */
export function oidcEnabled(): boolean {
  return Boolean(process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET);
}
