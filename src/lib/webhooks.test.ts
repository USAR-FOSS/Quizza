import { describe, expect, it, vi } from "vitest";
import {
  createSessionWebhookEvent,
  DEFAULT_BACKOFF_MS,
  DEFAULT_TOLERANCE_SEC,
  deliverWebhook,
  isSafeWebhookUrl,
  signWebhookPayload,
  verifyWebhookSignature,
} from "./webhooks";

describe("Webhook payload signing & replay protection", () => {
  const secret = "super-secret-key-12345";
  const payload = JSON.stringify({ message: "session started", sessionId: "sess-1" });

  it("computes reproducible HMAC-SHA256 signatures for a timestamp and payload", () => {
    const fixedTs = 1700000000;
    const { signature, timestamp } = signWebhookPayload(payload, secret, fixedTs);
    expect(timestamp).toBe(fixedTs);
    expect(signature).toHaveLength(64); // SHA-256 hex is 64 chars

    // Recomputing with same secret and timestamp produces identical signature
    const second = signWebhookPayload(payload, secret, fixedTs);
    expect(second.signature).toBe(signature);
  });

  it("verifies a valid signature successfully", () => {
    const now = 1700000000;
    const { signature, timestamp } = signWebhookPayload(payload, secret, now);

    const result = verifyWebhookSignature({
      payload,
      signature,
      timestamp,
      secret,
      nowSec: now,
    });

    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("accepts signatures prefixed with 'sha256='", () => {
    const now = 1700000000;
    const { signature, timestamp } = signWebhookPayload(payload, secret, now);

    const result = verifyWebhookSignature({
      payload,
      signature: `sha256=${signature}`,
      timestamp,
      secret,
      nowSec: now,
    });

    expect(result.valid).toBe(true);
  });

  it("rejects signatures if payload was modified (tampered)", () => {
    const now = 1700000000;
    const { signature, timestamp } = signWebhookPayload(payload, secret, now);

    const tamperedPayload = JSON.stringify({ message: "session started", sessionId: "sess-2" });
    const result = verifyWebhookSignature({
      payload: tamperedPayload,
      signature,
      timestamp,
      secret,
      nowSec: now,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects signatures if secret is incorrect", () => {
    const now = 1700000000;
    const { signature, timestamp } = signWebhookPayload(payload, secret, now);

    const result = verifyWebhookSignature({
      payload,
      signature,
      timestamp,
      secret: "wrong-secret",
      nowSec: now,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects signatures if timestamp drift exceeds tolerance (5 minutes replay protection)", () => {
    const baseTime = 1700000000;
    const { signature, timestamp } = signWebhookPayload(payload, secret, baseTime);

    // 5 minutes + 1 second later (301 seconds drift)
    const expiredResult = verifyWebhookSignature({
      payload,
      signature,
      timestamp,
      secret,
      toleranceSec: DEFAULT_TOLERANCE_SEC,
      nowSec: baseTime + 301,
    });

    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.reason).toBe("timestamp_expired");

    // 5 minutes within tolerance (299 seconds) should pass
    const validDriftResult = verifyWebhookSignature({
      payload,
      signature,
      timestamp,
      secret,
      toleranceSec: DEFAULT_TOLERANCE_SEC,
      nowSec: baseTime + 299,
    });

    expect(validDriftResult.valid).toBe(true);
  });

  it("rejects signatures with future timestamps beyond tolerance", () => {
    const baseTime = 1700000000;
    const futureTimestamp = baseTime + 350;
    const { signature } = signWebhookPayload(payload, secret, futureTimestamp);

    const result = verifyWebhookSignature({
      payload,
      signature,
      timestamp: futureTimestamp,
      secret,
      nowSec: baseTime,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("timestamp_expired");
  });

  it("rejects non-numeric timestamps cleanly", () => {
    const result = verifyWebhookSignature({
      payload,
      signature: "abc",
      timestamp: "not-a-number",
      secret,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_timestamp");
  });
});

describe("Webhook destination SSRF protection", () => {
  it("allows public https and http URLs", () => {
    expect(isSafeWebhookUrl("https://api.example.com/webhooks")).toBe(true);
    expect(isSafeWebhookUrl("http://webhooks.partner.org/ingest")).toBe(true);
  });

  it("blocks localhost and local hostnames", () => {
    expect(isSafeWebhookUrl("http://localhost:8080/events")).toBe(false);
    expect(isSafeWebhookUrl("https://sub.localhost/webhook")).toBe(false);
    expect(isSafeWebhookUrl("http://myserver.local/webhook")).toBe(false);
  });

  it("blocks loopback IP addresses (127.0.0.1, ::1)", () => {
    expect(isSafeWebhookUrl("http://127.0.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://127.0.0.2:3000/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://[::1]:8080/hook")).toBe(false);
  });

  it("blocks private RFC 1918 IPv4 ranges", () => {
    expect(isSafeWebhookUrl("http://10.0.0.1/webhook")).toBe(false);
    expect(isSafeWebhookUrl("http://172.16.0.1/webhook")).toBe(false);
    expect(isSafeWebhookUrl("http://172.31.255.254/webhook")).toBe(false);
    expect(isSafeWebhookUrl("http://192.168.1.100/webhook")).toBe(false);
  });

  it("blocks link-local cloud metadata endpoints (169.254.169.254)", () => {
    expect(isSafeWebhookUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeWebhookUrl("http://169.254.1.1/hook")).toBe(false);
  });

  it("blocks non-http protocols (file:, ftp:, gopher:)", () => {
    expect(isSafeWebhookUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeWebhookUrl("ftp://files.example.com/webhook")).toBe(false);
    expect(isSafeWebhookUrl("gopher://example.com")).toBe(false);
  });

  it("permits private networks when explicitly flagged (for dev/testing)", () => {
    expect(isSafeWebhookUrl("http://localhost:3000/webhook", true)).toBe(true);
    expect(isSafeWebhookUrl("http://127.0.0.1:8080/hook", true)).toBe(true);
  });
});

describe("Resilient webhook delivery & exponential backoff retries", () => {
  const secret = "test-secret";
  const dummyEvent = createSessionWebhookEvent("session.started", {
    id: "sess-123",
    quizId: "quiz-abc",
    mode: "live",
    status: "active",
  });

  it("delivers successfully on the first attempt without retrying", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ received: true }), {
        status: 200,
        statusText: "OK",
      })
    );
    const mockSleeper = vi.fn().mockResolvedValue(undefined);

    const result = await deliverWebhook({
      url: "https://api.partner.com/webhook",
      secret,
      event: dummyEvent,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleeper: mockSleeper,
    });

    expect(result.success).toBe(true);
    expect(result.totalAttempts).toBe(1);
    expect(result.finalStatusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockSleeper).not.toHaveBeenCalled();

    // Verify sent headers
    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers["X-Quizza-Signature"]).toBeDefined();
    expect(headers["X-Quizza-Timestamp"]).toBeDefined();
    expect(headers["X-Quizza-Event"]).toBe("session.started");
    expect(headers["X-Quizza-Delivery-Id"]).toBe(dummyEvent.id);
  });

  it("retries with exponential backoffs (1s, 5s, 15s) when receiving 5xx server errors", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500, statusText: "Internal Error" }))
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" }))
      .mockResolvedValueOnce(new Response("Gateway Timeout", { status: 504, statusText: "Gateway Timeout" }))
      .mockResolvedValueOnce(new Response("OK", { status: 200, statusText: "OK" }));

    const sleepDelays: number[] = [];
    const mockSleeper = vi.fn(async (ms: number) => {
      sleepDelays.push(ms);
    });

    const result = await deliverWebhook({
      url: "https://api.partner.com/webhook",
      secret,
      event: dummyEvent,
      backoffMs: [1000, 5000, 15000],
      fetchFn: mockFetch as unknown as typeof fetch,
      sleeper: mockSleeper,
    });

    expect(result.success).toBe(true);
    expect(result.totalAttempts).toBe(4);
    expect(result.finalStatusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // Verify 3 backoff sleeps matching 1s, 5s, 15s
    expect(sleepDelays).toEqual([1000, 5000, 15000]);
  });

  it("handles network timeouts and retries cleanly", async () => {
    const timeoutError = new Error("Request aborted");
    timeoutError.name = "AbortError";

    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(new Response("OK", { status: 200, statusText: "OK" }));

    const sleepDelays: number[] = [];
    const mockSleeper = vi.fn(async (ms: number) => {
      sleepDelays.push(ms);
    });

    const result = await deliverWebhook({
      url: "https://api.partner.com/webhook",
      secret,
      event: dummyEvent,
      backoffMs: [1000, 5000, 15000],
      fetchFn: mockFetch as unknown as typeof fetch,
      sleeper: mockSleeper,
    });

    expect(result.success).toBe(true);
    expect(result.totalAttempts).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(sleepDelays).toEqual([1000]);
    expect(result.attempts[0].error).toBe("Request timeout");
  });

  it("exhausts retries and returns complete failure telemetry if service never recovers", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" })
    );

    const sleepDelays: number[] = [];
    const mockSleeper = vi.fn(async (ms: number) => {
      sleepDelays.push(ms);
    });

    const result = await deliverWebhook({
      url: "https://api.partner.com/webhook",
      secret,
      event: dummyEvent,
      maxRetries: 3,
      backoffMs: DEFAULT_BACKOFF_MS,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleeper: mockSleeper,
    });

    expect(result.success).toBe(false);
    expect(result.totalAttempts).toBe(4); // 1 initial + 3 retries
    expect(result.finalStatusCode).toBe(503);
    expect(result.lastError).toContain("503");
    expect(sleepDelays).toEqual([1000, 5000, 15000]);
  });

  it("aborts immediately if destination URL fails SSRF security check", async () => {
    const mockFetch = vi.fn();
    const result = await deliverWebhook({
      url: "http://127.0.0.1/private-endpoint",
      secret,
      event: dummyEvent,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.totalAttempts).toBe(0);
    expect(result.lastError).toBe("unsafe_url_destination");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("Privacy & payload sanitization", () => {
  it("omits participant personal info and raw answers from session webhook payloads", () => {
    const event = createSessionWebhookEvent("session.ended", {
      id: "sess-999",
      quizId: "quiz-111",
      mode: "live",
      status: "ended",
      currentQuestionId: "q-3",
      revealed: true,
      startedAt: new Date("2026-11-18T00:00:00.000Z"),
      endedAt: new Date("2026-11-18T00:30:00.000Z"),
    });

    expect(event.apiVersion).toBe("v1");
    expect(event.event).toBe("session.ended");
    expect(event.data.sessionId).toBe("sess-999");
    expect(event.data.quizId).toBe("quiz-111");
    expect(event.data.startedAt).toBe("2026-11-18T00:00:00.000Z");
    expect(event.data.endedAt).toBe("2026-11-18T00:30:00.000Z");

    // Ensure raw answer choices or player emails are not present in payload
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("participantAnswer");
    expect(serialized).not.toContain("deviceId");
  });
});
