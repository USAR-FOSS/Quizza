import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publish, subscribe } from "./bus";
import type { LiveEvent } from "./events";

const sessionId = "11111111-1111-4111-8111-111111111111";

describe("realtime bus memory adapter", () => {
  beforeEach(() => {
    vi.stubEnv("REALTIME_DRIVER", "memory");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("routes host ticks only to the host subscriber", async () => {
    const host = vi.fn();
    const player = vi.fn();
    const closeHost = await subscribe(sessionId, "host", host);
    const closePlayer = await subscribe(sessionId, "player", player);

    await publish(sessionId, { kind: "tick", answeredCount: 7 });

    expect(host).toHaveBeenCalledWith(
      { kind: "tick", answeredCount: 7 },
      expect.any(String),
    );
    expect(player).not.toHaveBeenCalled();
    await closeHost();
    await closePlayer();
  });

  it("removes listeners exactly once", async () => {
    const handler = vi.fn();
    const close = await subscribe(sessionId, "player", handler);
    await close();
    await close();

    await publish(sessionId, {
      kind: "participant_changed",
      joined: true,
      participant: {
        participantId: "22222222-2222-4222-8222-222222222222",
        nickname: "Ada",
        avatarColor: "#000",
        score: 0,
        rank: 1,
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("preserves the event payload for roster updates", async () => {
    const handler = vi.fn<(event: LiveEvent, eventId: string) => void>();
    const close = await subscribe(sessionId, "player", handler);
    const event: LiveEvent = {
      kind: "participant_changed",
      joined: false,
      participant: {
        participantId: "33333333-3333-4333-8333-333333333333",
        nickname: "Grace",
        avatarColor: "#fff",
        score: 10,
        rank: 1,
      },
    };
    await publish(sessionId, event);
    expect(handler).toHaveBeenCalledWith(event, expect.any(String));
    await close();
  });
});
