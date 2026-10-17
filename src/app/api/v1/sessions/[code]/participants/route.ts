import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { handle, json, parseBody, enforceRateLimit } from "@/lib/api/http";
import { JoinBody } from "@/lib/api/schemas";
import { joinSession } from "@/lib/sessions";
import { getCurrentUser } from "@/lib/auth";
import { generateToken } from "@/lib/codes";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { and, asc, eq, ilike, ne } from "drizzle-orm";
import { getParticipantByToken, resolveSession } from "@/lib/sessions";
import { rateLimit } from "@/lib/rate-limit";
import { HttpError } from "@/lib/api/http";

type Ctx = { params: Promise<{ code: string }> };

/** Small authenticated roster search for choosing a live attack target. */
export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  const token = req.headers.get("x-client-token");
  const { code } = await params;
  const session = await resolveSession(code);
  if (!session || session.mode !== "live")
    throw new HttpError(404, "session_not_found", "Live room not found");
  const me = token && await getParticipantByToken(session.id, token);
  if (!me) throw new HttpError(401, "invalid_token", "Join this room first");
  const limit = await rateLimit(`targets:${token}`, 30, 60_000);
  if (!limit.ok) throw new HttpError(429, "rate_limited", "Too many searches");
  const search = new URL(req.url).searchParams.get("search")?.trim().slice(0, 40) ?? "";
  const escaped = search.replace(/[\\%_]/g, "\\$&");
  const rows = await db.select({
    id: participants.id,
    nickname: participants.nickname,
    avatarColor: participants.avatarColor,
    avatarUrl: participants.avatarUrl,
  }).from(participants).where(and(
    eq(participants.sessionId, session.id),
    ne(participants.id, me.id),
    ...(escaped ? [ilike(participants.nickname, `%${escaped}%`)] : []),
  )).orderBy(asc(participants.joinedAt)).limit(20);
  return json(rows);
});

export const POST = handle<Ctx>(async (req: NextRequest, { params }) => {
  // Shared school/event Wi-Fi often means hundreds of players share one IP.
  await enforceRateLimit(req, "join", 1_500, 60_000);
  const { code } = await params;
  const body = await parseBody(req, JoinBody);

  const user = await getCurrentUser();

  // A stable device id (for one-per-device participation). Set once, reused.
  const jar = await cookies();
  let deviceId = jar.get("quizza_device")?.value ?? null;
  if (!deviceId) {
    deviceId = generateToken();
    jar.set("quizza_device", deviceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const participant = await joinSession(code, body, {
    userId: user?.id ?? null,
    deviceId,
  });
  return json(participant, 201);
});
