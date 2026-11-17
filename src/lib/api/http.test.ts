import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  bearerToken,
  clientIp,
  enforceRateLimit,
  errorResponse,
  handle,
  HttpError,
  json,
  parseBody,
} from "./http";

describe("shared API HTTP error handling", () => {
  describe("HttpError and errorResponse", () => {
    it("constructs an HttpError with status, code, and details", () => {
      const err = new HttpError(404, "not_found", "Resource missing", { id: "123" });
      expect(err.status).toBe(404);
      expect(err.code).toBe("not_found");
      expect(err.message).toBe("Resource missing");
      expect(err.details).toEqual({ id: "123" });
    });

    it("serializes error response with details when provided", async () => {
      const res = errorResponse(400, "bad_request", "Bad input", { field: "title" });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: "bad_request",
          message: "Bad input",
          details: { field: "title" },
        },
      });
    });

    it("omits details field when details are undefined", async () => {
      const res = errorResponse(403, "forbidden", "Access denied");
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: "forbidden",
          message: "Access denied",
        },
      });
      expect("details" in data.error).toBe(false);
    });

    it("returns standard json payload with json helper", async () => {
      const res = json({ ok: true }, 201);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toEqual({ ok: true });
    });
  });

  describe("parseBody", () => {
    const schema = z.object({
      name: z.string().min(2),
      count: z.number().int().positive(),
    });

    it("parses and validates a valid JSON body", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        body: JSON.stringify({ name: "Quiz", count: 10 }),
        headers: { "content-type": "application/json" },
      });

      const body = await parseBody(req, schema);
      expect(body).toEqual({ name: "Quiz", count: 10 });
    });

    it("throws HttpError 400 invalid_json on malformed JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        body: "{ malformed json",
        headers: { "content-type": "application/json" },
      });

      try {
        await parseBody(req, schema);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        const httpErr = err as HttpError;
        expect(httpErr.status).toBe(400);
        expect(httpErr.code).toBe("invalid_json");
        expect(httpErr.message).toBe("Request body must be valid JSON");
      }
    });

    it("throws HttpError 422 validation_error with issues on schema violations", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        body: JSON.stringify({ name: "A", count: -5 }),
        headers: { "content-type": "application/json" },
      });

      try {
        await parseBody(req, schema);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        const httpErr = err as HttpError;
        expect(httpErr.status).toBe(422);
        expect(httpErr.code).toBe("validation_error");
        expect(httpErr.message).toBe("Request failed validation");
        expect(Array.isArray(httpErr.details)).toBe(true);
      }
    });
  });

  describe("handle route wrapper", () => {
    it("returns successful response from the underlying handler", async () => {
      const handler = handle(async () => json({ success: true }));
      const req = new NextRequest("http://localhost:3000/api/test");
      const res = await handler(req, {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true });
    });

    it("converts thrown HttpError into structured error response", async () => {
      const handler = handle(async () => {
        throw new HttpError(404, "session_not_found", "Session not found", { code: "ABC" });
      });
      const req = new NextRequest("http://localhost:3000/api/test");
      const res = await handler(req, {});
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: "session_not_found",
          message: "Session not found",
          details: { code: "ABC" },
        },
      });
    });

    it("does not expose internal exception details on unexpected errors (returns 500 internal_error)", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const handler = handle(async () => {
        throw new Error("Internal secret database connection leak: sensitive_db_token");
      });
      const req = new NextRequest("http://localhost:3000/api/test");
      const res = await handler(req, {});
      expect(res.status).toBe(500);
      const data = await res.json();

      expect(data).toEqual({
        error: {
          code: "internal_error",
          message: "Something went wrong",
        },
      });
      expect(JSON.stringify(data)).not.toContain("sensitive_db_token");
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("clientIp and bearerToken utilities", () => {
    it("extracts first ip from x-forwarded-for header", () => {
      const req = new NextRequest("http://localhost:3000", {
        headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18" },
      });
      expect(clientIp(req)).toBe("203.0.113.195");
    });

    it("falls back to x-real-ip or local", () => {
      const reqReal = new NextRequest("http://localhost:3000", {
        headers: { "x-real-ip": "198.51.100.1" },
      });
      expect(clientIp(reqReal)).toBe("198.51.100.1");

      const reqEmpty = new NextRequest("http://localhost:3000");
      expect(clientIp(reqEmpty)).toBe("local");
    });

    it("extracts bearer token from authorization header", () => {
      const req = new NextRequest("http://localhost:3000", {
        headers: { authorization: "Bearer host-token-abc" },
      });
      expect(bearerToken(req)).toBe("host-token-abc");
    });

    it("returns null when authorization header is absent or invalid", () => {
      const req1 = new NextRequest("http://localhost:3000");
      expect(bearerToken(req1)).toBeNull();

      const req2 = new NextRequest("http://localhost:3000", {
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });
      expect(bearerToken(req2)).toBeNull();

      const req3 = new NextRequest("http://localhost:3000", {
        headers: { authorization: "Bearer " },
      });
      expect(bearerToken(req3)).toBeNull();
    });
  });

  describe("enforceRateLimit", () => {
    it("throws HttpError 429 when rate limit is exceeded", async () => {
      const req = new NextRequest("http://localhost:3000", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      });

      // Rapidly call limit
      let caught: HttpError | null = null;
      try {
        for (let i = 0; i < 20; i++) {
          await enforceRateLimit(req, "test_action", 3, 60_000);
        }
      } catch (err) {
        if (err instanceof HttpError) caught = err;
      }

      expect(caught).not.toBeNull();
      expect(caught?.status).toBe(429);
      expect(caught?.code).toBe("rate_limited");
      expect(caught?.message).toMatch(/Too many requests/);
    });
  });
});
