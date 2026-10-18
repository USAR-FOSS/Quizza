import type { NextRequest } from "next/server";
import { buildSnapshots } from "@/lib/realtime/snapshot";
import { subscribe } from "@/lib/realtime/bus";
import { resolveSession, getParticipantByToken } from "@/lib/sessions";
import { onRedisSubscriberReconnect, usesRedisRealtime } from "@/lib/redis/client";
import { scheduleRoster, scheduleRosterBatch } from "@/lib/realtime/notifications";
import { refreshPresence } from "@/lib/realtime/presence";
import { HttpError } from "@/lib/api/http";

type Ctx = { params: Promise<{ code: string }> };

// EventSource reconnects before the common Vercel five-minute function limit.
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const url = new URL(req.url);
  const hostToken = url.searchParams.get("host");
  const playerToken = url.searchParams.get("player");

  const session = await resolveSession(code);
  if (!session) return new Response("Session not found", { status: 404 });

  let participant = null;
  try {
    participant = playerToken
      ? await getParticipantByToken(session.id, playerToken)
      : null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      return new Response("Unauthorized", { status: 401 });
    throw error;
  }
  let role: "host" | "player";
  if (hostToken && hostToken === session.hostToken) {
    role = "host";
  } else if (participant) {
    role = "player";
  } else {
    return new Response("Unauthorized", { status: 401 });
  }
  if (role === "player" && session.mode === "live" && participant) {
    const presence = await refreshPresence(session.id, participant.id);
    scheduleRosterBatch(session.id, presence.expired, false);
    if (presence.joined || !usesRedisRealtime())
      scheduleRoster(session.id, participant.id, true);
  }

  const encoder = new TextEncoder();
  let unsubscribe: () => Promise<void> = async () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let detachAbort = () => {};
  let detachReconnect = () => {};
  const cleanup = () => {
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (lifetime) clearTimeout(lifetime);
    void unsubscribe().catch((error) =>
      console.error("[realtime] stream unsubscribe failed", error),
    );
    detachAbort();
    detachReconnect();
  };

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("retry: 1500\n\n"));
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );
        } catch {
          cleanup();
        }
      };

      let initializing = true;
      let newerState: unknown;
      let playerPhase: string | undefined;
      let latestTick: number | undefined;
      const pendingRoster: Array<{
        participant: unknown;
        joined: boolean;
        eventId: string;
      }> = [];
      unsubscribe = await subscribe(session.id, role, (event, eventId) => {
        if (event.kind === "state") {
          const state = role === "host" ? event.host : event.player;
          playerPhase = state.phase;
          latestTick = undefined;
          if (initializing) newerState = state;
          else send(state);
        } else if (event.kind === "tick" && role === "host") {
          if (initializing) latestTick = event.answeredCount;
          else send({ tick: event.answeredCount });
        } else if (event.kind === "participant_changed") {
          if (!initializing && role === "player" && playerPhase !== "lobby") return;
          const rosterEvent = {
            participant: event.participant,
            joined: event.joined,
            eventId,
          };
          if (initializing) pendingRoster.push(rosterEvent);
          else send({ participantChanged: event.participant, joined: event.joined, eventId });
        }
      });

      const abort = () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", abort, { once: true });
      detachAbort = () => req.signal.removeEventListener("abort", abort);
      detachReconnect = onRedisSubscriberReconnect(abort);
      if (req.signal.aborted) {
        abort();
        return;
      }
      try {
        const snap = await buildSnapshots(session.id);
        if (closed) return;
        const firstState = (newerState ?? (role === "host" ? snap.host : snap.player)) as typeof snap.player;
        playerPhase = firstState.phase;
        send(firstState);
        if (latestTick !== undefined) send({ tick: latestTick });
        if (role === "host" || playerPhase === "lobby")
          for (const event of pendingRoster)
            send({
              participantChanged: event.participant,
              joined: event.joined,
              eventId: event.eventId,
            });
        initializing = false;
      } catch (err) {
        cleanup();
        controller.error(err);
        return;
      }

      let presenceUpdateRunning = false;
      heartbeat = setInterval(() => {
        if (usesRedisRealtime() && session.mode === "live" && !presenceUpdateRunning) {
          presenceUpdateRunning = true;
          void refreshPresence(
            session.id,
            role === "player" && session.mode === "live" ? participant?.id : undefined,
          )
            .then((presence) => {
              scheduleRosterBatch(session.id, presence.expired, false);
              if (presence.joined && participant)
                scheduleRoster(session.id, participant.id, true);
            })
            .catch((error) => console.error("[realtime] presence heartbeat failed", error))
            .finally(() => {
              presenceUpdateRunning = false;
            });
        }
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 25000);
      lifetime = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {}
      }, 270_000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
