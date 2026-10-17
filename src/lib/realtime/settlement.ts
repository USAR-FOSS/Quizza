import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { answers, participants, questions, sessions } from "@/lib/db/schema";
import { planAttackSettlements } from "@/lib/powerups";

export type RevealJob = {
  sessionId: string;
  questionId: string;
  questionStartedAt: string;
};
export type RevealResult =
  | { status: "revealed" }
  | { status: "already_revealed" }
  | { status: "stale" }
  | { status: "early"; retryAfter: number };

/** Settle all attacks and reveal once, under the same session row lock. */
export async function settleDueQuestion(job: RevealJob): Promise<RevealResult> {
  const startedAt = new Date(job.questionStartedAt);
  if (Number.isNaN(startedAt.getTime())) return { status: "stale" };
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions)
      .where(eq(sessions.id, job.sessionId)).for("update");
    if (!session || session.mode !== "live" || session.status !== "active" ||
        session.currentQuestionId !== job.questionId ||
        !session.questionStartedAt ||
        session.questionStartedAt.getTime() !== startedAt.getTime())
      return { status: "stale" } as const;
    if (session.revealed) return { status: "already_revealed" } as const;

    const [question] = await tx.select({ points: questions.points, timeLimitSec: questions.timeLimitSec })
      .from(questions).where(eq(questions.id, job.questionId));
    if (!question) return { status: "stale" } as const;
    const remaining = startedAt.getTime() + question.timeLimitSec * 1000 - Date.now();
    if (remaining > 0)
      return { status: "early", retryAfter: Math.max(1, Math.ceil(remaining / 1000)) } as const;

    const roundAnswers = await tx.select().from(answers).where(and(
      eq(answers.sessionId, session.id), eq(answers.questionId, job.questionId),
    ));
    const players = await tx.select({ id: participants.id, score: participants.score })
      .from(participants).where(eq(participants.sessionId, session.id));
    const plan = planAttackSettlements(roundAnswers, players, question.points);
    // Only players whose score changed need a write. All changes are committed
    // with the reveal flag, so retries can never transfer points twice.
    const changedScores = players.flatMap((player) => {
      const score = plan.scores.get(player.id);
      return score !== undefined && score !== player.score ? [{ id: player.id, score }] : [];
    });
    for (let i = 0; i < changedScores.length; i += 200) {
      const batch = changedScores.slice(i, i + 200);
      await tx.execute(sql`UPDATE participants SET score = CASE id
        ${sql.join(batch.map((entry) => sql`WHEN ${entry.id}::uuid THEN ${entry.score}`), sql` `)}
        ELSE score END WHERE id IN (${sql.join(batch.map((entry) => sql`${entry.id}::uuid`), sql`, `)})`);
    }
    for (let i = 0; i < plan.outcomes.length; i += 200) {
      const batch = plan.outcomes.slice(i, i + 200);
      await tx.execute(sql`UPDATE answers SET
        attack_stolen = CASE id ${sql.join(batch.map((entry) => sql`WHEN ${entry.answerId}::uuid THEN ${entry.stolen}`), sql` `)} ELSE attack_stolen END,
        attack_blocked = CASE id ${sql.join(batch.map((entry) => sql`WHEN ${entry.answerId}::uuid THEN ${entry.blocked}`), sql` `)} ELSE attack_blocked END
        WHERE id IN (${sql.join(batch.map((entry) => sql`${entry.answerId}::uuid`), sql`, `)})`);
    }
    await tx.update(sessions).set({ revealed: true }).where(eq(sessions.id, session.id));
    return { status: "revealed" } as const;
  });
}
