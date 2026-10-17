import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { answers, participants } from "@/lib/db/schema";
import { getRedisPublisher, usesRedisRealtime } from "@/lib/redis/client";
import { answerCounterKey } from "./channels";
import { publish } from "./bus";

const ANSWER_COUNTER_TTL_SECONDS = 6 * 60 * 60;

type ParticipantRecord = {
  id: string;
  nickname: string;
  avatarColor: string;
  avatarUrl?: string | null;
  score?: number;
};

function participantEntry(participant: ParticipantRecord) {
  return {
    participantId: participant.id,
    nickname: participant.nickname,
    avatarColor: participant.avatarColor,
    avatarUrl: participant.avatarUrl ?? null,
    score: participant.score ?? 0,
    // The lobby does not need a stable rank. The next full snapshot supplies it.
    rank: 0,
  };
}

/** Publishes a small roster delta instead of rebuilding the whole room snapshot. */
export function scheduleRoster(
  sessionId: string,
  participantId: string,
  joined: boolean,
) {
  scheduleRosterBatch(sessionId, [participantId], joined);
}

/** Batch-fetch expired members so a large disconnect does not fan out DB reads. */
export function scheduleRosterBatch(
  sessionId: string,
  participantIds: string[],
  joined: boolean,
) {
  if (!participantIds.length) return;
  void (async () => {
    const rows = await db
      .select()
      .from(participants)
      .where(and(
        eq(participants.sessionId, sessionId),
        inArray(participants.id, participantIds),
      ));
    await Promise.all(rows.map((participant) =>
      publish(sessionId, {
        kind: "participant_changed",
        participant: participantEntry(participant),
        joined,
      }),
    ));
  })().catch((err) => console.error("[realtime] roster", err));
}

/** Sets the authoritative short-lived counter before a live round opens. */
export async function resetAnswerCounter(
  sessionId: string,
  questionId: string,
): Promise<void> {
  if (!usesRedisRealtime()) return;
  try {
    const redis = await getRedisPublisher();
    await redis.set(answerCounterKey(sessionId, questionId), "0", {
      EX: ANSWER_COUNTER_TTL_SECONDS,
    });
  } catch (err) {
    console.error("[realtime] answer counter reset", err);
  }
}

/**
 * Publishes a host-only answer count. Redis counters avoid a Postgres count and
 * a full-room snapshot for every answer in a burst. Postgres remains authoritative
 * and is used for the initial/reconnected snapshot.
 */
export function scheduleAnswerCount(sessionId: string, questionId: string) {
  void (async () => {
    let count: number;
    if (usesRedisRealtime()) {
      const redis = await getRedisPublisher();
      const key = answerCounterKey(sessionId, questionId);
      count = await redis.incr(key);
      await redis.expire(key, ANSWER_COUNTER_TTL_SECONDS);
    } else {
      const [{ count: dbCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(answers)
        .where(
          and(
            eq(answers.sessionId, sessionId),
            eq(answers.questionId, questionId),
          ),
        );
      count = dbCount;
    }
    await publish(sessionId, { kind: "tick", answeredCount: count });
  })().catch((err) => console.error("[realtime] answers", err));
}
