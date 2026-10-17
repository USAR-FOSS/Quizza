import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { participants, uploads } from "@/lib/db/schema";
import { handle, HttpError, json } from "@/lib/api/http";
import { requireQuizOwner } from "@/lib/quiz-access";
import { getParticipantByToken, resolveSession } from "@/lib/sessions";
import { rateLimit } from "@/lib/rate-limit";
import {
  imageContentType,
  isSameUploadOrigin,
  MAX_IMAGE_BYTES,
} from "@/lib/upload-format";
import { scheduleRoster } from "@/lib/realtime/notifications";

export const POST = handle(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  // Next may construct req.url with its internal bind host behind a proxy.
  // The incoming Host header is the browser-visible destination, unlike req.url.
  if (!isSameUploadOrigin(origin, req.headers.get("host")))
    throw new HttpError(403, "origin", "Upload from this app only.");
  const quizId = req.headers.get("x-quiz-id");
  const code = req.headers.get("x-room-code");
  const token = req.headers.get("x-client-token");
  let ownerId: string | null = null;
  let participantId: string | null = null;
  let sessionId: string | null = null;
  if (quizId) {
    try {
      ownerId = (await requireQuizOwner(quizId)).ownerId;
    } catch {
      throw new HttpError(
        403,
        "forbidden",
        "Open an editable quiz you own to upload images.",
      );
    }
  } else if (code && token) {
    const session = await resolveSession(code);
    const participant =
      session && (await getParticipantByToken(session.id, token));
    if (!session || session.status === "ended" || !participant)
      throw new HttpError(403, "forbidden", "Join an open room first.");
    participantId = participant.id;
    sessionId = session.id;
  } else
    throw new HttpError(401, "unauthorized", "Sign in or join a room first.");
  if (!(await rateLimit(`upload:${ownerId ?? participantId}`, 20, 60_000)).ok)
    throw new HttpError(
      429,
      "rate_limited",
      "Take a moment before uploading another image.",
    );
  const scope = quizId
    ? eq(uploads.quizId, quizId)
    : eq(uploads.participantId, participantId!);
  const [usage] = await db
    .select({
      size: sql<number>`coalesce(sum(length(${uploads.data})), 0)::int`,
    })
    .from(uploads)
    .where(scope);
  if (usage.size > (quizId ? 40 : 6) * 1024 * 1024)
    throw new HttpError(
      413,
      "quota",
      "This quiz or player has reached its image upload allowance.",
    );
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "empty", "Choose an image first.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "too_large", "Use an image smaller than 2 MB.");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  const contentType = imageContentType(bytes);
  if (!contentType)
    throw new HttpError(
      415,
      "invalid_image",
      "Choose a PNG, JPEG or WebP image.",
    );
  const [asset] = await db
    .insert(uploads)
    .values({
      ownerId,
      quizId,
      participantId,
      contentType,
      data: bytes.toString("base64"),
    })
    .returning({ id: uploads.id });
  const url = `/api/v1/uploads/${asset.id}`;
  if (participantId && sessionId) {
    await db
      .update(participants)
      .set({ avatarUrl: url })
      .where(
        and(
          eq(participants.id, participantId),
          eq(participants.sessionId, sessionId),
        ),
      );
    scheduleRoster(sessionId, participantId, false);
  }
  return json({ url }, 201);
});
