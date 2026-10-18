import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  sanitizeRedirectPath,
  createSessionCookie,
  getCurrentUser,
  revokeUserSessions,
} from "@/lib/auth";

const mockCookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      mockCookieStore.has(name) ? { name, value: mockCookieStore.get(name)! } : undefined,
    set: (name: string, value: string) => mockCookieStore.set(name, value),
    delete: (name: string) => mockCookieStore.delete(name),
  })),
}));

const mockDbUser: { id: string; sessionVersion: number } = {
  id: "user-1",
  sessionVersion: 1,
};

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [mockDbUser],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (values.sessionVersion) {
            mockDbUser.sessionVersion += 1;
          }
        },
      }),
    }),
  },
}));

describe("sanitizeRedirectPath", () => {
  it("accepts valid relative internal paths", () => {
    expect(sanitizeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/play/123456")).toBe("/play/123456");
    expect(sanitizeRedirectPath("/host/session?foo=bar#section")).toBe("/host/session?foo=bar#section");
  });

  it("rejects open redirect attempts with ASCII control characters", () => {
    expect(sanitizeRedirectPath("/\t/attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/\r/attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/\n/attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/\u0000/attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/\x1f/attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/\x7f/attacker.com")).toBe("/dashboard");
  });

  it("rejects protocol-relative and scheme-relative URLs", () => {
    expect(sanitizeRedirectPath("//attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("///attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/\\attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("\\attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("https://attacker.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("uses provided fallback or default for invalid or empty inputs", () => {
    expect(sanitizeRedirectPath(null)).toBe("/dashboard");
    expect(sanitizeRedirectPath(undefined)).toBe("/dashboard");
    expect(sanitizeRedirectPath("")).toBe("/dashboard");
    expect(sanitizeRedirectPath("invalid", "/custom")).toBe("/custom");
  });
});

describe("passwords", () => {
  it("hashes and verifies passwords securely using scrypt", async () => {
    const password = "SuperSecretPassword123!";
    const hash = await hashPassword(password);
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("password", "invalid")).toBe(false);
    expect(await verifyPassword("password", "md5:salt:hash")).toBe(false);
  });
});

describe("session tokens and revocation", () => {
  beforeEach(() => {
    mockCookieStore.clear();
    mockDbUser.sessionVersion = 1;
  });

  it("validates session token matching active sessionVersion", async () => {
    await createSessionCookie("user-1", 1);
    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect(user?.id).toBe("user-1");
  });

  it("invalidates session tokens when sessionVersion increments", async () => {
    await createSessionCookie("user-1", 1);
    await revokeUserSessions("user-1");
    expect(mockDbUser.sessionVersion).toBe(2);

    const user = await getCurrentUser();
    expect(user).toBeNull();
  });
});
