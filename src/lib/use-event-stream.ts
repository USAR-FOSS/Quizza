"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Subscribes to an SSE endpoint and returns the latest decoded message.
 * A `{ tick: n }` message is merged into the current snapshot as answeredCount,
 * so the host sees live answer counts without a full state rebuild.
 */
export function useEventStream<T>(url: string | null): {
  data: T | null;
  connection: "connecting" | "connected" | "reconnecting";
} {
  const [data, setData] = useState<T | null>(null);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "reconnecting"
  >("connecting");
  const seenEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!url) return;
    seenEvents.current.clear();
    const es = new EventSource(url);
    es.onopen = () => setConnection("connected");
    es.onerror = () => setConnection("reconnecting");
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed && typeof parsed === "object" && "tick" in parsed) {
          setData((prev) =>
            prev ? ({ ...prev, answeredCount: parsed.tick } as T) : prev,
          );
        } else if (
          parsed &&
          typeof parsed === "object" &&
          "participantChanged" in parsed
        ) {
          const eventId =
            typeof parsed.eventId === "string" ? parsed.eventId : null;
          if (eventId && seenEvents.current.has(eventId)) return;
          if (eventId) {
            seenEvents.current.add(eventId);
            if (seenEvents.current.size > 100) {
              const first = seenEvents.current.values().next().value;
              if (first) seenEvents.current.delete(first);
            }
          }
          const participant = parsed.participantChanged;
          const joined = parsed.joined === true;
          setData((prev) => {
            if (
              !prev ||
              !participant ||
              typeof participant.participantId !== "string"
            )
              return prev;
            const current = prev as T & {
              participantCount?: number;
              leaderboard?: Array<{ participantId: string }>;
            };
            const roster = current.leaderboard ?? [];
            const exists = roster.some(
              (entry) => entry.participantId === participant.participantId,
            );
            const nextRoster =
              joined || exists
                ? [
                    ...roster.filter(
                      (entry) => entry.participantId !== participant.participantId,
                    ),
                    participant,
                  ]
                : roster;
            return {
              ...current,
              participantCount:
                joined && !exists
                  ? (current.participantCount ?? 0) + 1
                  : current.participantCount,
              leaderboard: nextRoster,
            } as T;
          });
        } else {
          if (parsed && typeof parsed.serverNow === "number")
            parsed.clockOffsetMs = parsed.serverNow - Date.now();
          setData(parsed as T);
        }
      } catch {
        // ignore malformed frames / heartbeats
      }
    };
    return () => es.close();
  }, [url]);

  return { data, connection };
}
