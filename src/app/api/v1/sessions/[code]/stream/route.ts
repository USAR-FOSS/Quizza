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
  } else if (playerToken && (await getParticipantByToken(session.id, playerToken))) {
    role = "player";
  } else {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // stream closed
        }
      };

      const snap = await buildSnapshots(session.id);
      send(role === "host" ? snap.host : snap.player);

      unsubscribe = subscribe(session.id, (event) => {
        if (event.kind === "state") {
          send(role === "host" ? event.host : event.player);
        } else if (event.kind === "tick" && role === "host") {
          send({ tick: event.answeredCount });
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // stream closed
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
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
