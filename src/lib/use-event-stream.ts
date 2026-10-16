"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!url) return;
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
