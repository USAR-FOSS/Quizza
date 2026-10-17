import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  getRedisPublisher,
  getRedisSubscriber,
  usesRedisRealtime,
} from "@/lib/redis/client";
import {
  hostChannel,
  rosterChannel,
  stateChannel,
} from "./channels";
import type { LiveEvent } from "./events";

type Role = "host" | "player";
type Audience = "state" | "host" | "roster";

type Envelope = {
  version: 1;
  eventId: string;
  sessionId: string;
  emittedAt: string;
  event: LiveEvent;
};

type ChannelState = {
  handlers: Set<(event: LiveEvent, eventId: string) => void>;
  operation: Promise<void>;
};

const globalBus = globalThis as typeof globalThis & {
  quizzaMemoryBus?: EventEmitter;
  quizzaRedisChannels?: Map<string, ChannelState>;
};

const memoryBus = (globalBus.quizzaMemoryBus ??= new EventEmitter());
memoryBus.setMaxListeners(0);
const redisChannels = (globalBus.quizzaRedisChannels ??= new Map());

function channelFor(sessionId: string, audience: Audience): string {
  if (audience === "state") return stateChannel(sessionId);
  if (audience === "host") return hostChannel(sessionId);
  return rosterChannel(sessionId);
}

function audienceFor(event: LiveEvent): Audience {
  if (event.kind === "tick") return "host";
  if (event.kind === "participant_changed") return "roster";
  return "state";
}

function isLiveEvent(value: unknown): value is LiveEvent {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "state" || kind === "tick" || kind === "participant_changed";
}

function decode(raw: string): Envelope | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const envelope = value as Partial<Envelope>;
    if (
      envelope.version !== 1 ||
      typeof envelope.eventId !== "string" ||
      typeof envelope.sessionId !== "string" ||
      typeof envelope.emittedAt !== "string" ||
      !isLiveEvent(envelope.event)
    )
      return null;
    return envelope as Envelope;
  } catch {
    return null;
  }
}

function dispatch(channel: string, raw: string): void {
  const envelope = decode(raw);
  if (!envelope) {
    console.warn("[realtime] ignored malformed Redis event", { channel });
    return;
  }
  if (!channel.includes(`:session:${envelope.sessionId}:`)) {
    console.warn("[realtime] ignored cross-session Redis event", { channel });
    return;
  }
  const state = redisChannels.get(channel);
  if (!state) return;
  for (const handler of state.handlers) {
    try {
      handler(envelope.event, envelope.eventId);
    } catch (error) {
      console.error("[realtime] event handler failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function subscribeChannel(channel: string, state: ChannelState) {
  if (!state.handlers.size) return;
  const subscriber = await getRedisSubscriber();
  await subscriber.subscribe(channel, (raw) => dispatch(channel, raw));
}

async function unsubscribeChannel(channel: string, state: ChannelState) {
  if (state.handlers.size) return;
  const subscriber = await getRedisSubscriber();
  await subscriber.unsubscribe(channel);
  redisChannels.delete(channel);
}

function queueChannelOperation(
  channel: string,
  state: ChannelState,
  operation: () => Promise<void>,
): Promise<void> {
  const next = state.operation.catch(() => {}).then(operation);
  state.operation = next;
  return next.finally(() => {
    if (state.operation === next) state.operation = Promise.resolve();
  });
}

/** Publishes through Redis, or synchronously through the local test adapter. */
export async function publish(
  sessionId: string,
  event: LiveEvent,
): Promise<void> {
  const envelope: Envelope = {
    version: 1,
    eventId: randomUUID(),
    sessionId,
    emittedAt: new Date().toISOString(),
    event,
  };
  const channel = channelFor(sessionId, audienceFor(event));
  const encoded = JSON.stringify(envelope);

  if (!usesRedisRealtime()) {
    memoryBus.emit(channel, event, envelope.eventId);
    return;
  }

  const publisher = await getRedisPublisher();
  await publisher.publish(channel, encoded);
}

/**
 * Subscribes once per channel per warm app instance and fans out locally to all
 * SSE requests. The returned cleanup is idempotent and asynchronous.
 */
export async function subscribe(
  sessionId: string,
  role: Role,
  handler: (event: LiveEvent, eventId: string) => void,
): Promise<() => Promise<void>> {
  const audiences: Audience[] =
    role === "host" ? ["state", "roster", "host"] : ["state", "roster"];
  const channels = audiences.map((audience) => channelFor(sessionId, audience));

  try {
    for (const channel of channels) {
      let state = redisChannels.get(channel);
      if (!state) {
        state = { handlers: new Set(), operation: Promise.resolve() };
        redisChannels.set(channel, state);
      }
      const wasEmpty = state.handlers.size === 0;
      state.handlers.add(handler);
      if (usesRedisRealtime() && wasEmpty) {
        await queueChannelOperation(channel, state, () =>
          subscribeChannel(channel, state!),
        );
      } else if (usesRedisRealtime()) {
        // A concurrent first listener may still be connecting. Do not report
        // this SSE listener ready until Redis is actually subscribed.
        await state.operation;
      } else if (!usesRedisRealtime()) {
        memoryBus.on(channel, handler);
      }
    }
  } catch (error) {
    await cleanupSubscription(channels, handler);
    throw error;
  }

  let closed = false;
  return async () => {
    if (closed) return;
    closed = true;
    await cleanupSubscription(channels, handler);
  };
}

async function cleanupSubscription(
  channels: string[],
  handler: (event: LiveEvent, eventId: string) => void,
): Promise<void> {
  for (const channel of channels) {
    if (!usesRedisRealtime()) {
      memoryBus.off(channel, handler);
      continue;
    }
    const state = redisChannels.get(channel);
    if (!state) continue;
    state.handlers.delete(handler);
    if (!state.handlers.size) {
      await queueChannelOperation(channel, state, () =>
        unsubscribeChannel(channel, state!),
      );
    }
  }
}
