import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/api/http";
import {
  API_SCOPES,
  authenticateScopedApiRequest,
  generateScopedApiToken,
  hasRequiredScopes,
  verifyScopedApiToken,
} from "./api-tokens";

describe("Scoped API Credentials (Issue #82)", () => {
  const customSecret = "integration-test-secret-32-chars-long!";
  const basePayload = {
    sub: "user-12345",
    scopes: ["sessions:read", "quiz:manage"] as const,
    clientId: "client-abc",
    name: "Automated Integration Test",
  };

  it("exports valid supported scopes", () => {
    expect(API_SCOPES).toContain("sessions:read");
    expect(API_SCOPES).toContain("sessions:write");
    expect(API_SCOPES).toContain("quiz:manage");
    expect(API_SCOPES).toContain("webhooks:listen");
  });

  it("checks required scopes correctly with hasRequiredScopes", () => {
    expect(
      hasRequiredScopes(["sessions:read", "quiz:manage"], ["sessions:read"])
    ).toBe(true);
    expect(
      hasRequiredScopes(
        ["sessions:read", "quiz:manage"],
        ["sessions:read", "quiz:manage"]
      )
    ).toBe(true);
    expect(
      hasRequiredScopes(["sessions:read"], ["sessions:read", "webhooks:listen"])
    ).toBe(false);
    expect(hasRequiredScopes([], [])).toBe(true);
  });

  it("generates a signed JWT with scopes and verifies it successfully", async () => {
    const token = await generateScopedApiToken(
      {
        sub: basePayload.sub,
        scopes: ["sessions:read", "quiz:manage"],
        clientId: basePayload.clientId,
      },
      { secret: customSecret, expiresIn: "1h" }
    );

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // Header, payload, signature

    const verification = await verifyScopedApiToken(
      token,
      ["sessions:read"],
      { secret: customSecret }
    );

    expect(verification.valid).toBe(true);
    if (verification.valid) {
      expect(verification.payload.sub).toBe("user-12345");
      expect(verification.payload.clientId).toBe("client-abc");
      expect(verification.payload.scopes).toEqual([
        "sessions:read",
        "quiz:manage",
      ]);
    }
  });

  it("rejects verification if caller lacks required scopes", async () => {
    const token = await generateScopedApiToken(
      {
        sub: basePayload.sub,
        scopes: ["sessions:read"],
      },
      { secret: customSecret }
    );

    const result = await verifyScopedApiToken(
      token,
      ["sessions:read", "webhooks:listen"],
      { secret: customSecret }
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("insufficient_scope");
    }
  });

  it("rejects expired tokens cleanly", async () => {
    const token = await generateScopedApiToken(
      {
        sub: basePayload.sub,
        scopes: ["sessions:read"],
      },
      { secret: customSecret, expiresIn: "-10s" } // Already expired
    );

    const result = await verifyScopedApiToken(token, ["sessions:read"], {
      secret: customSecret,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("token_expired");
    }
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await generateScopedApiToken(
      {
        sub: basePayload.sub,
        scopes: ["sessions:read"],
      },
      { secret: customSecret }
    );

    const result = await verifyScopedApiToken(token, ["sessions:read"], {
      secret: "completely-different-signing-key-32!",
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("invalid_token");
    }
  });

  it("rejects tampered token strings", async () => {
    const result = await verifyScopedApiToken("not.a.valid.jwt", [], {
      secret: customSecret,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("invalid_token");
    }
  });

  describe("authenticateScopedApiRequest middleware", () => {
    it("authenticates valid Bearer token and enforces scopes", async () => {
      const token = await generateScopedApiToken({
        sub: "user-456",
        scopes: ["webhooks:listen", "sessions:read"],
      });

      const request = new Request("https://api.quizza.io/v1/webhooks", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const payload = await authenticateScopedApiRequest(request, [
        "webhooks:listen",
      ]);

      expect(payload.sub).toBe("user-456");
      expect(payload.scopes).toContain("webhooks:listen");
    });

    it("throws 401 when Authorization header is missing", async () => {
      const request = new Request("https://api.quizza.io/v1/sessions");

      await expect(authenticateScopedApiRequest(request)).rejects.toThrow(
        HttpError
      );
      try {
        await authenticateScopedApiRequest(request);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(401);
        expect((err as HttpError).code).toBe("unauthorized");
      }
    });

    it("throws 401 when Authorization header is not Bearer scheme", async () => {
      const request = new Request("https://api.quizza.io/v1/sessions", {
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });

      await expect(authenticateScopedApiRequest(request)).rejects.toThrow(
        HttpError
      );
    });

    it("throws 403 when Bearer token lacks required scope", async () => {
      const token = await generateScopedApiToken({
        sub: "user-789",
        scopes: ["sessions:read"],
      });

      const request = new Request("https://api.quizza.io/v1/admin", {
        headers: { authorization: `Bearer ${token}` },
      });

      await expect(
        authenticateScopedApiRequest(request, ["quiz:manage"])
      ).rejects.toThrow(HttpError);

      try {
        await authenticateScopedApiRequest(request, ["quiz:manage"]);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(403);
        expect((err as HttpError).code).toBe("insufficient_scope");
      }
    });
  });
});
