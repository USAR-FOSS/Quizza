import { and, eq, ne, or, isNull, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { options, questions, quizzes, sessions } from "@/lib/db/schema";

export async function requireQuizOwner(quizId: string, editing = true) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in to manage quizzes.");
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, quizId),
  });
  if (!quiz || quiz.ownerId !== user.id)
    throw new Error("Quiz not found or access denied.");
  if (editing) {
    const running = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.quizId, quizId),
        ne(sessions.status, "ended"),
        or(
          eq(sessions.mode, "live"),
          isNull(sessions.closesAt),
          gt(sessions.closesAt, new Date()),
        ),
      ),
    });
    if (
      running &&
      !(
        running.mode === "scheduled" &&
        running.closesAt &&
        running.closesAt.getTime() < Date.now()
      )
    ) {
      throw new Error("End the running session before editing this quiz.");
    }
  }
  return quiz;
}

export async function requireQuestionOwner(questionId: string) {
  const question = await db.query.questions.findFirst({
    where: eq(questions.id, questionId),
  });
  if (!question) throw new Error("Question not found.");
  await requireQuizOwner(question.quizId);
  return question;
}

export async function requireOptionOwner(optionId: string) {
  const option = await db.query.options.findFirst({
    where: eq(options.id, optionId),
  });
  if (!option) throw new Error("Option not found.");
  await requireQuestionOwner(option.questionId);
  return option;
}
