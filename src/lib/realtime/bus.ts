import { EventEmitter } from "node:events";
import type { LiveEvent } from "./events";

/**
 * In-process pub/sub keyed by session id. A single instance is enough for the
 * operating target (ADR 0018). This sits behind a tiny interface so a Postgres
 * LISTEN/NOTIFY or Redis adapter can replace it for multi-instance later (ADR
 * 0015) without changing call sites.
 */
const g = globalThis as unknown as { _quizzaBus?: EventEmitter };
const bus = g._quizzaBus ?? new EventEmitter();
bus.setMaxListeners(0); // many SSE subscribers per room
g._quizzaBus = bus;

export function publish(sessionId: string, event: LiveEvent): void {
  bus.emit(sessionId, event);
}

export function subscribe(
  sessionId: string,
  handler: (event: LiveEvent) => void,
): () => void {
  bus.on(sessionId, handler);
  return () => {
    bus.off(sessionId, handler);
  };
}
