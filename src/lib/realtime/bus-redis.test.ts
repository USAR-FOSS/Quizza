import { describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const listeners = new Map<string, (message: string) => void>();
  let releaseFirst: (() => void) | undefined;
  const firstSubscription = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const subscriber = {
    subscribe: vi.fn(async (channel: string, listener: (message: string) => void) => {
      await firstSubscription;
      listeners.set(channel, listener);
    }),
    unsubscribe: vi.fn(async (channel: string) => {
      listeners.delete(channel);
    }),
  };
  const publisher = {
    publish: vi.fn(async (channel: string, message: string) => {
      listeners.get(channel)?.(message);
    }),
  };
  return { subscriber, publisher, releaseFirst: () => releaseFirst?.() };
});

vi.mock("@/lib/redis/client", () => ({
  usesRedisRealtime: () => true,
  getRedisSubscriber: async () => fake.subscriber,
  getRedisPublisher: async () => fake.publisher,
}));

import { publish, subscribe } from "./bus";

describe("Redis realtime subscription", () => {
  it("waits for the first subscribe before resolving concurrent listeners", async () => {
    const sessionId = "44444444-4444-4444-8444-444444444444";
    const one = vi.fn();
    const two = vi.fn();
    let secondReady = false;
    const first = subscribe(sessionId, "player", one);
    const second = subscribe(sessionId, "player", two).then((cleanup) => {
      secondReady = true;
      return cleanup;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secondReady).toBe(false);

    fake.releaseFirst();
    const [closeOne, closeTwo] = await Promise.all([first, second]);
    expect(fake.subscriber.subscribe).toHaveBeenCalledTimes(2); // state + roster

    await publish(sessionId, { kind: "tick", answeredCount: 2 });
    expect(one).not.toHaveBeenCalled();
    expect(two).not.toHaveBeenCalled();

    await closeOne();
    expect(fake.subscriber.unsubscribe).not.toHaveBeenCalled();
    await closeTwo();
    expect(fake.subscriber.unsubscribe).toHaveBeenCalledTimes(2);
  });
});
