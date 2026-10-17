import { createHash } from "node:crypto";
import { getRedisPublisher, usesRedisRealtime } from "@/lib/redis/client";

type Entry = { count: number; resetAt: number };
const globalForRl = globalThis as typeof globalThis & {
  _quizzaRl?: Map<string, Entry>;
};
const fallback = (globalForRl._quizzaRl ??= new Map());

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`;

function fallbackLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = fallback.get(key);
  if (!entry || now > entry.resetAt) {
    fallback.set(key, { count: 1, resetAt: now + windowMs });
    if (fallback.size > 10_000) {
      for (const [storedKey, value] of fallback)
        if (now > value.resetAt) fallback.delete(storedKey);
    }
    return { ok: true, retryAfter: 0 };
  }
  if (entry.count >= limit)
    return {
      ok: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  entry.count += 1;
  return { ok: true, retryAfter: 0 };
}

function redisKey(identifier: string): string {
  const digest = createHash("sha256").update(identifier).digest("hex");
  return `quizza:v1:ratelimit:${digest}`;
}

/** Distributed fixed-window limiter with a bounded local outage fallback. */
export async function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  if (!usesRedisRealtime()) return fallbackLimit(identifier, limit, windowMs);
  try {
    const redis = await getRedisPublisher();
    const raw = await redis.sendCommand([
      "EVAL",
      FIXED_WINDOW_SCRIPT,
      "1",
      redisKey(identifier),
      String(windowMs),
    ]);
    const values = raw as unknown as [number | string, number | string];
    const count = Number(values[0]);
    const pttl = Math.max(0, Number(values[1]));
    return {
      ok: count <= limit,
      retryAfter: count <= limit ? 0 : Math.max(1, Math.ceil(pttl / 1000)),
    };
  } catch (error) {
    console.warn("[realtime] ratelimit redis fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackLimit(identifier, limit, windowMs);
  }
}
