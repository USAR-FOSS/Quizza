import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBytesToMb,
  toMemoryMetric,
  measureProbe,
  evaluateHealthAuth,
} from "./diagnostics-metrics.ts";
import { presenceKey, answerCounterKey, stateChannel } from "./realtime/channels.ts";

describe("Diagnostics and Performance Probes", () => {
  it("formats bytes to megabytes accurately", () => {
    assert.equal(formatBytesToMb(0), 0);
    assert.equal(formatBytesToMb(1024 * 1024), 1);
    assert.equal(formatBytesToMb(50 * 1024 * 1024), 50);
    assert.equal(formatBytesToMb(1500000), 1.43);
  });

  it("converts byte values into structured memory metrics", () => {
    const metric = toMemoryMetric(10 * 1024 * 1024);
    assert.equal(metric.bytes, 10485760);
    assert.equal(metric.megabytes, 10);
  });

  it("measures successful probe execution and records non-negative latency", async () => {
    const result = await measureProbe(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "ok";
    });
    assert.equal(typeof result.latencyMs, "number");
    assert.ok(result.latencyMs !== null && result.latencyMs >= 5);
    assert.equal(result.error, undefined);
  });

  it("safely catches probe failures and reports error details with null latency", async () => {
    const result = await measureProbe(async () => {
      throw new Error("Connection refused (ECONNREFUSED)");
    });
    assert.equal(result.latencyMs, null);
    assert.equal(result.error, "Connection refused (ECONNREFUSED)");
  });

  it("verifies Redis channel key conventions and valid UUID formatting", () => {
    const validUuid = "12345678-1234-4123-8123-123456789abc";
    const validQid = "87654321-4321-4321-8321-cba987654321";

    assert.equal(
      presenceKey(validUuid),
      `quizza:v1:session:${validUuid}:presence`,
    );
    assert.equal(
      answerCounterKey(validUuid, validQid),
      `quizza:v1:session:${validUuid}:question:${validQid}:answers`,
    );
    assert.equal(
      stateChannel(validUuid),
      `quizza:v1:session:${validUuid}:state`,
    );
  });

  it("rejects invalid UUIDs when formatting channel keys", () => {
    assert.throws(() => presenceKey("invalid-session-id"), /Invalid realtime session id/);
    assert.throws(
      () => answerCounterKey("12345678-1234-4123-8123-123456789abc", "malicious-key"),
      /Invalid realtime question id/,
    );
  });

  describe("evaluateHealthAuth security policy", () => {
    it("returns liveness (200) for unauthenticated probe when secret is unset", () => {
      const result = evaluateHealthAuth(undefined, null);
      assert.deepEqual(result, { kind: "liveness", status: 200 });
    });

    it("returns liveness (200) for unauthenticated probe when secret is configured", () => {
      const result = evaluateHealthAuth("super-secret-token", null);
      assert.deepEqual(result, { kind: "liveness", status: 200 });
    });

    it("fails closed (503) when header is supplied but secret is unconfigured", () => {
      const result = evaluateHealthAuth(undefined, "attempted-header-secret");
      assert.equal(result.kind, "disabled");
      assert.equal(result.status, 503);
    });

    it("fails closed (503) when secret is empty string or whitespace", () => {
      const result = evaluateHealthAuth("   ", "attempted-header-secret");
      assert.equal(result.kind, "disabled");
      assert.equal(result.status, 503);
    });

    it("returns unauthorized (401) when header does not match expected secret", () => {
      const result = evaluateHealthAuth("super-secret-token", "wrong-secret");
      assert.equal(result.kind, "unauthorized");
      assert.equal(result.status, 401);
    });

    it("grants full diagnostics access (200) when header matches expected secret", () => {
      const result = evaluateHealthAuth("super-secret-token", "super-secret-token");
      assert.deepEqual(result, { kind: "diagnostics", status: 200 });
    });
  });
});
