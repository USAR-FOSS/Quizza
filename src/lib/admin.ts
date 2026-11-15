import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { participants, quizzes, sessions, users } from "@/lib/db/schema";
import { publishState } from "@/lib/realtime/snapshot";
import { HttpError } from "@/lib/api/http";

export type AdminOverviewData = {
  stats: {
    activeSessionsCount: number;
    totalSessionsCount: number;
    totalQuizzesCount: number;
    totalUsersCount: number;
    totalParticipantsCount: number;
  };
  activeSessions: Array<{
    id: string;
    code: string;
    mode: "live" | "scheduled";
    status: "lobby" | "active" | "ended";
    quizTitle: string;
    ownerEmail: string | null;
    participantCount: number;
    createdAt: string;
  }>;
};

/** Gathers platform metrics and live session roster for administrators. */
export async function getAdminOverview(): Promise<AdminOverviewData> {
  const [
    [{ activeSessionsCount }],
    [{ totalSessionsCount }],
    [{ totalQuizzesCount }],
    [{ totalUsersCount }],
    [{ totalParticipantsCount }],
  ] = await Promise.all([
    db
      .select({ activeSessionsCount: sql<number>`count(*)::int` })
      .from(sessions)
      .where(inArray(sessions.status, ["lobby", "active"])),
    db
      .select({ totalSessionsCount: sql<number>`count(*)::int` })
      .from(sessions),
    db
      .select({ totalQuizzesCount: sql<number>`count(*)::int` })
      .from(quizzes),
    db
      .select({ totalUsersCount: sql<number>`count(*)::int` })
      .from(users),
    db
      .select({ totalParticipantsCount: sql<number>`count(*)::int` })
      .from(participants),
  ]);

  const activeRows = await db
    .select({
      id: sessions.id,
      code: sessions.code,
      mode: sessions.mode,
      status: sessions.status,
      createdAt: sessions.createdAt,
      quizTitle: quizzes.title,
      ownerEmail: users.email,
    })
    .from(sessions)
    .leftJoin(quizzes, eq(sessions.quizId, quizzes.id))
    .leftJoin(users, eq(quizzes.ownerId, users.id))
    .where(inArray(sessions.status, ["lobby", "active"]))
    .orderBy(desc(sessions.createdAt))
    .limit(50);

  const sessionIds = activeRows.map((r) => r.id);
  const participantCounts = sessionIds.length
    ? await db
        .select({
          sessionId: participants.sessionId,
          count: sql<number>`count(*)::int`,
        })
        .from(participants)
        .where(inArray(participants.sessionId, sessionIds))
        .groupBy(participants.sessionId)
    : [];

  const countBySession = new Map(participantCounts.map((c) => [c.sessionId, c.count]));

  const activeSessions = activeRows.map((row) => ({
    id: row.id,
    code: row.code,
    mode: row.mode,
    status: row.status,
    quizTitle: row.quizTitle ?? "Untitled Quiz",
    ownerEmail: row.ownerEmail,
    participantCount: countBySession.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    stats: {
      activeSessionsCount,
      totalSessionsCount,
      totalQuizzesCount,
      totalUsersCount,
      totalParticipantsCount,
    },
    activeSessions,
  };
}

/** Emergency kill-switch: administrative termination of an active session. */
export async function terminateSessionAsAdmin(sessionId: string) {
  const [s] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!s) {
    throw new HttpError(404, "session_not_found", "Session not found");
  }

  await db
    .update(sessions)
    .set({
      status: "ended",
      endedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  if (s.mode === "live") {
    await publishState(s.id).catch(() => {});
  }

  return { ok: true as const, terminatedSessionId: sessionId };
}
