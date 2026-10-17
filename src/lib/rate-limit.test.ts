import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rate limit", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the fixed-window policy in the memory adapter", async () => {
    vi.stubEnv("REALTIME_DRIVER", "memory");
    const identifier = `test-${Date.now()}-${Math.random()}`;
    await expect(rateLimit(identifier, 2, 60_000)).resolves.toMatchObject({
      ok: true,
    });
    await expect(rateLimit(identifier, 2, 60_000)).resolves.toMatchObject({
      ok: true,
    });
    const blocked = await rateLimit(identifier, 2, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
  });
});
