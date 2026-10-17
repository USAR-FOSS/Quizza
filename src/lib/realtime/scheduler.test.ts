import { afterEach, describe, expect, it, vi } from "vitest";
import { revealDeduplicationId, scheduleReveal } from "./scheduler";

describe("reveal scheduler", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses local mode in tests without QStash credentials", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("QSTASH_TOKEN", "");
    await expect(
      scheduleReveal(
        {
          sessionId: "11111111-1111-4111-8111-111111111111",
          questionId: "22222222-2222-4222-8222-222222222222",
          questionStartedAt: new Date().toISOString(),
        },
        Date.now() + 1000,
      ),
    ).resolves.toEqual({ mode: "local" });
  });

  it("creates a stable QStash-safe deduplication ID without colons", () => {
    const job = {
      sessionId: "11111111-1111-4111-8111-111111111111",
      questionId: "22222222-2222-4222-8222-222222222222",
      questionStartedAt: "2026-10-17T12:34:56.789Z",
    };
    const id = revealDeduplicationId(job);
    expect(id).not.toContain(":");
    expect(id).toBe(revealDeduplicationId(job));
    expect(id).not.toBe(
      revealDeduplicationId({ ...job, questionStartedAt: "2026-10-17T12:34:57.789Z" }),
    );
  });
});
