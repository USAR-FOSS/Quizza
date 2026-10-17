import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { questions, sessions } from "@/lib/db/schema";
import { publishState } from "./snapshot";

export type RevealJob = {
  sessionId: string;
  questionId: string;
  questionStartedAt: string;
};

export type RevealResult =
  | { status: "revealed" }
  | { status: "stale" }
  | { status: "early"; retryAfter: number };

/** Applies a QStash reveal only to the exact still-running round. */
export async function revealDueQuestion(job: RevealJob): Promise<RevealResult> {
  const startedAt = new Date(job.questionStartedAt);
  if (Number.isNaN(startedAt.getTime())) return { status: "stale" };

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, job.sessionId))
    .limit(1);
  if (
    !session ||
    session.mode !== "live" ||
    session.status !== "active" ||
    session.currentQuestionId !== job.questionId ||
    session.revealed ||
    !session.questionStartedAt ||
    session.questionStartedAt.getTime() !== startedAt.getTime()
  )
    return { status: "stale" };

  const question = await db.query.questions.findFirst({
    where: eq(questions.id, job.questionId),
    columns: { timeLimitSec: true },
  });
  if (!question) return { status: "stale" };

  const deadline = startedAt.getTime() + question.timeLimitSec * 1000;
  const remaining = deadline - Date.now();
  if (remaining > 0)
    return {
      status: "early",
      retryAfter: Math.max(1, Math.ceil(remaining / 1000)),
    };

  const changed = await db
    .update(sessions)
    .set({ revealed: true })
    .where(
      and(
        eq(sessions.id, session.id),
        eq(sessions.mode, "live"),
        eq(sessions.status, "active"),
        eq(sessions.currentQuestionId, job.questionId),
        eq(sessions.revealed, false),
        eq(sessions.questionStartedAt, startedAt),
      ),
    )
    .returning({ id: sessions.id });

  if (!changed.length) return { status: "stale" };
  await publishState(session.id);
  console.info("[realtime] reveal completed", {
    sessionId: session.id,
    questionId: job.questionId,
  });
  return { status: "revealed" };
}
