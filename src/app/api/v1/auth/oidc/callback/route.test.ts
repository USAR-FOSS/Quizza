import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  lookup: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  session: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("jose", () => ({ createRemoteJWKSet: vi.fn(), jwtVerify: mocks.verify }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie, delete: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ oidcEnabled: () => true, createSessionCookie: mocks.session }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.lookup }) }) }),
    update: () => ({ set: (values: unknown) => ({ where: () => mocks.update(values) }) }),
    insert: () => ({ values: (values: unknown) => ({ returning: () => mocks.insert(values) }) }),
  },
}));
import { GET } from "./route";

const claims = { sub: "provider-user", nonce: "nonce", email: "host@example.org", email_verified: true };
const request = () => new NextRequest("http://localhost:3000/api/v1/auth/oidc/callback?code=code&state=state");

describe("OIDC account identity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("OIDC_ISSUER", "https://identity.example.org");
    vi.stubEnv("OIDC_CLIENT_ID", "quizza");
    vi.stubEnv("OIDC_CLIENT_SECRET", "test-secret");
    const cookies: Record<string, string> = { oidc_state: "state", oidc_verifier: "verifier", oidc_nonce: "nonce" };
    mocks.cookie.mockImplementation((key: string) => cookies[key] ? { value: cookies[key] } : undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id_token: "signed-token" })));
    mocks.verify.mockResolvedValue({ payload: claims });
    mocks.lookup.mockResolvedValue([]);
    mocks.insert.mockResolvedValue([{ id: "new-account" }]);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it.each([undefined, false, "true"])("rejects an email without boolean verification (%s)", async (verified) => {
    mocks.verify.mockResolvedValue({ payload: { ...claims, email_verified: verified } });
    const response = await GET(request());
    expect(response.headers.get("location")).toContain("oidc_email_unverified");
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it.each([null, "other-provider-user"])("never links a matching email account with subject %s", async (subject) => {
    mocks.lookup.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "victim", subject }]);
    const response = await GET(request());
    expect(response.headers.get("location")).toContain("oidc_account_conflict");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("signs in the same subject without overwriting another account", async () => {
    mocks.lookup.mockResolvedValue([{ id: "existing", subject: claims.sub }]);
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(mocks.session).toHaveBeenCalledWith("existing");
    expect(mocks.verify).toHaveBeenCalledWith("signed-token", undefined, {
      issuer: "https://identity.example.org", audience: "quizza", algorithms: ["RS256"],
    });
  });

  it("rejects an existing subject changing email to another account's address", async () => {
    mocks.lookup.mockResolvedValueOnce([{ id: "existing" }]).mockResolvedValueOnce([{ id: "other" }]);
    expect((await GET(request())).headers.get("location")).toContain("oidc_account_conflict");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("creates a new account for a new subject with an unused verified email", async () => {
    expect((await GET(request())).headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ subject: claims.sub, email: claims.email }));
    expect(mocks.session).toHaveBeenCalledWith("new-account");
  });

  it("rejects a mismatched nonce before account access", async () => {
    mocks.verify.mockResolvedValue({ payload: { ...claims, nonce: "wrong" } });
    expect((await GET(request())).headers.get("location")).toContain("oidc_nonce");
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
});
