/**
 * A tiny in-process fixed-window rate limiter. Sufficient for the single-instance
 * operating target (ADR 0018); a multi-instance deployment would move this to the
 * shared backplane (ADR 0015).
 */
type Entry = { count: number; resetAt: number };

const globalForRl = globalThis as unknown as { _quizzaRl?: Map<string, Entry> };
const store = globalForRl._quizzaRl ?? new Map<string, Entry>();
globalForRl._quizzaRl = store;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    // opportunistic cleanup so the map does not grow unbounded
    if (store.size > 10_000) {
      for (const [k, v] of store) if (now > v.resetAt) store.delete(k);
    }
    return { ok: true, retryAfter: 0 };
  }
  if (entry.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, retryAfter: 0 };
}
