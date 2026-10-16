import type { NextRequest } from "next/server";
import { buildSnapshots } from "@/lib/realtime/snapshot";
import { subscribe } from "@/lib/realtime/bus";
import { resolveSession, getParticipantByToken } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const url = new URL(req.url);
  const hostToken = url.searchParams.get("host");
  const playerToken = url.searchParams.get("player");

  const session = await resolveSession(code);
  if (!session) return new Response("Session not found", { status: 404 });

  let role: "host" | "player";
  if (hostToken && hostToken === session.hostToken) {
    role = "host";
  } else if (
    playerToken &&
    (await getParticipantByToken(session.id, playerToken))
  ) {
    role = "player";
  } else {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let detachAbort = () => {};
  const cleanup = () => {
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    detachAbort();
  };

  const stream = new ReadableStream({
    async start(controller) {
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
      let latestTick: number | undefined;
      unsubscribe = subscribe(session.id, (event) => {
        if (event.kind === "state") {
          const state = role === "host" ? event.host : event.player;
          latestTick = undefined;
          if (initializing) newerState = state;
          else send(state);
        } else if (event.kind === "tick" && role === "host") {
          if (initializing) latestTick = event.answeredCount;
          else send({ tick: event.answeredCount });
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
      if (req.signal.aborted) {
        abort();
        return;
      }
      try {
        const snap = await buildSnapshots(session.id);
        if (closed) return;
        send(newerState ?? (role === "host" ? snap.host : snap.player));
        if (latestTick !== undefined) send({ tick: latestTick });
        initializing = false;
      } catch (err) {
        cleanup();
        controller.error(err);
        return;
      }

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 25000);
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
