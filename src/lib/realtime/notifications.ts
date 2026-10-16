import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { answers, sessions } from "@/lib/db/schema";
import { publish } from "./bus";
import { publishState } from "./snapshot";

// Coalesce joins and answer bursts rather than rebuilding/counting per player.
const pending = new Map<string, ReturnType<typeof setTimeout>>();
export function scheduleRoster(sessionId: string) {
  const key = `roster:${sessionId}`;
  if (pending.has(key)) return;
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      void publishState(sessionId).catch((err) =>
        console.error("[realtime] roster", err),
      );
    }, 100),
  );
}

export function scheduleAnswerCount(sessionId: string, questionId: string) {
  const key = `answers:${sessionId}:${questionId}`;
  if (pending.has(key)) return;
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      void (async () => {
        const current = await db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
          columns: { currentQuestionId: true, revealed: true },
        });
        if (current?.currentQuestionId !== questionId || current.revealed)
          return;
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(answers)
          .where(
            and(
              eq(answers.sessionId, sessionId),
              eq(answers.questionId, questionId),
            ),
          );
        publish(sessionId, { kind: "tick", answeredCount: count });
      })().catch((err) => console.error("[realtime] answers", err));
    }, 100),
  );
}
