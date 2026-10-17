import type { NextRequest } from "next/server";
import { handle, json, HttpError } from "@/lib/api/http";
import { resolveSession, getParticipantByToken } from "@/lib/sessions";
import { removePresence } from "@/lib/realtime/presence";
import { publish } from "@/lib/realtime/bus";

type Ctx = { params: Promise<{ code: string }> };

/** Best-effort live presence signal when a player closes or leaves the room. */
export const POST = handle<Ctx>(async (req: NextRequest, { params }) => {
  const token = req.headers.get("x-client-token");
  const { code } = await params;
  const session = await resolveSession(code);
  if (!session || session.mode !== "live")
    throw new HttpError(404, "session_not_found", "Live room not found");
  const participant = token && (await getParticipantByToken(session.id, token));
  if (!participant)
    throw new HttpError(401, "invalid_token", "Join this room first");

  await removePresence(session.id, participant.id);
  await publish(session.id, {
    kind: "participant_changed",
    participant: {
      participantId: participant.id,
      nickname: participant.nickname,
      avatarColor: participant.avatarColor,
      avatarUrl: participant.avatarUrl,
      score: participant.score,
      rank: 0,
    },
    joined: false,
  });
  return json({ ok: true });
});
