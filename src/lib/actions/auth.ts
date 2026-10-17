"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  hashPassword,
  verifyPassword,
  createSessionCookie,
  clearSessionCookie,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

type Result = { ok: true } | { error: string };

async function throttle(name: string, limit: number): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return (await rateLimit(`${name}:${ip}`, limit, 60_000)).ok;
}

const registerSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8).max(200),
  name: z.string().trim().max(80).optional(),
});

export async function registerAction(input: unknown): Promise<Result> {
  if (!(await throttle("register", 10))) {
    return { error: "Too many attempts. Please wait a minute." };
  }
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: "Enter a valid email and a password of at least 8 characters",
    };
  const email = parsed.data.email.toLowerCase();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length)
    return { error: "An account with that email already exists" };

  const [u] = await db
    .insert(users)
    .values({
      email,
      name: parsed.data.name || email.split("@")[0],
      passwordHash: await hashPassword(parsed.data.password),
    })
    .returning();
  await createSessionCookie(u.id);
  return { ok: true };
}

const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200),
});

export async function loginAction(input: unknown): Promise<Result> {
  if (!(await throttle("login", 10))) {
    return { error: "Too many attempts. Please wait a minute." };
  }
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter your email and password" };
  const email = parsed.data.email.toLowerCase();

  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (
    !u ||
    !u.passwordHash ||
    !(await verifyPassword(parsed.data.password, u.passwordHash))
  ) {
    return { error: "Invalid email or password" };
  }
  await createSessionCookie(u.id);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
}
