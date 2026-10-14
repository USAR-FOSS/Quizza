"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { options, questions, quizzes } from "@/lib/db/schema";
import { DEFAULTS, OPTION_COLORS } from "@/lib/quiz-constants";
import type {
  OptionRow,
  QuestionType,
  QuestionWithOptions,
} from "@/lib/db/schema-types";

/* ------------------------------------------------------------------ *
 *  schemas
 * ------------------------------------------------------------------ */

const questionTypeSchema = z.enum([
  "multiple_choice",
  "true_false",
  "poll",
  "word_cloud",
  "scale",
  "open_text",
]);

const createQuizSchema = z.object({
  title: z.string().trim().min(1).max(120),
  coverIcon: z.string().trim().min(1).max(32).default("shapes"),
  theme: z.string().trim().min(1).max(24).default("grape"),
});

/* ------------------------------------------------------------------ *
 *  helpers
 * ------------------------------------------------------------------ */

/** The starter options a freshly-added question of a given type should have. */
function defaultOptions(type: QuestionType): Array<{
  label: string;
  isCorrect: boolean;
  color: string;
}> {
  if (type === "true_false") {
    return [
      { label: "True", isCorrect: true, color: "mint" },
      { label: "False", isCorrect: false, color: "coral" },
    ];
  }
  if (type === "multiple_choice" || type === "poll") {
    const n = type === "poll" ? 2 : DEFAULTS.optionsPerQuestion;
    return Array.from({ length: n }, (_, i) => ({
      label: "",
      isCorrect: false,
      color: OPTION_COLORS[i % OPTION_COLORS.length],
    }));
  }
  return []; // word_cloud / scale / open_text have no options
}

/* ------------------------------------------------------------------ *
 *  quiz
 * ------------------------------------------------------------------ */

export async function createQuiz(input: z.input<typeof createQuizSchema>) {
  const data = createQuizSchema.parse(input);
  const [quiz] = await db
    .insert(quizzes)
    .values({ title: data.title, coverIcon: data.coverIcon, theme: data.theme })
    .returning({ id: quizzes.id });
  return quiz.id;
}

const quizSettingsSchema = z.object({
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  allowLateJoin: z.boolean().optional(),
  revealAnswers: z.enum(["per_question", "at_end", "never"]).optional(),
  leaderboard: z.enum(["per_question", "at_end", "never"]).optional(),
  participation: z.enum(["anonymous", "one_per_device", "signed_in"]).optional(),
});

const updateQuizSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  coverIcon: z.string().trim().min(1).max(32).optional(),
  theme: z.string().trim().min(1).max(24).optional(),
  settings: quizSettingsSchema.optional(),
});

export async function updateQuiz(
  quizId: string,
  patch: z.infer<typeof updateQuizSchema>,
) {
  const data = updateQuizSchema.parse(patch);
  if (Object.keys(data).length === 0) return;
  await db
    .update(quizzes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(quizzes.id, quizId));
}

/* ------------------------------------------------------------------ *
 *  questions
 * ------------------------------------------------------------------ */

export async function addQuestion(
  quizId: string,
  type: QuestionType,
): Promise<QuestionWithOptions> {
  questionTypeSchema.parse(type);

  // next position = current count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questions)
    .where(eq(questions.quizId, quizId));

  const settings =
    type === "scale"
      ? { scaleMin: DEFAULTS.scaleMin, scaleMax: DEFAULTS.scaleMax }
      : {};

  const [q] = await db
    .insert(questions)
    .values({
      quizId,
      type,
      position: count,
      prompt: "",
      timeLimitSec: DEFAULTS.timeLimitSec,
      points: DEFAULTS.points,
      settings,
    })
    .returning();

  const defs = defaultOptions(type);
  let createdOptions: OptionRow[] = [];
  if (defs.length) {
    createdOptions = await db
      .insert(options)
      .values(
        defs.map((o, i) => ({
          questionId: q.id,
          position: i,
          label: o.label,
          isCorrect: o.isCorrect,
          color: o.color,
        })),
      )
      .returning();
  }

  return { ...q, options: createdOptions } as QuestionWithOptions;
}

const updateQuestionSchema = z.object({
  prompt: z.string().max(300).optional(),
  timeLimitSec: z.number().int().min(5).max(300).optional(),
  points: z.number().int().min(0).max(5000).optional(),
  settings: z
    .object({
      scaleMin: z.number().int().optional(),
      scaleMax: z.number().int().optional(),
      scaleMinLabel: z.string().max(40).optional(),
      scaleMaxLabel: z.string().max(40).optional(),
      maxWords: z.number().int().min(1).max(10).optional(),
      speedBonus: z.boolean().optional(),
    })
    .optional(),
});

export async function updateQuestion(
  questionId: string,
  patch: z.infer<typeof updateQuestionSchema>,
) {
  const data = updateQuestionSchema.parse(patch);
  if (Object.keys(data).length === 0) return;
  await db.update(questions).set(data).where(eq(questions.id, questionId));
}

export async function deleteQuestion(questionId: string) {
  // fetch the quiz + position so we can close the gap afterwards
  const [row] = await db
    .select({ quizId: questions.quizId, position: questions.position })
    .from(questions)
    .where(eq(questions.id, questionId));
  if (!row) return;

  await db.delete(questions).where(eq(questions.id, questionId));
  // shift later questions down by one to keep positions contiguous
  await db
    .update(questions)
    .set({ position: sql`${questions.position} - 1` })
    .where(
      and(
        eq(questions.quizId, row.quizId),
        sql`${questions.position} > ${row.position}`,
      ),
    );
}

export async function reorderQuestions(quizId: string, orderedIds: string[]) {
  z.array(z.string().uuid()).parse(orderedIds);
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(questions)
        .set({ position: i })
        .where(and(eq(questions.id, orderedIds[i]), eq(questions.quizId, quizId)));
    }
  });
}

/* ------------------------------------------------------------------ *
 *  options
 * ------------------------------------------------------------------ */

export async function addOption(questionId: string): Promise<OptionRow> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(options)
    .where(eq(options.questionId, questionId));

  const [opt] = await db
    .insert(options)
    .values({
      questionId,
      position: count,
      label: "",
      color: OPTION_COLORS[count % OPTION_COLORS.length],
    })
    .returning();
  return opt;
}

const updateOptionSchema = z.object({
  label: z.string().max(120).optional(),
  isCorrect: z.boolean().optional(),
  color: z.string().max(24).nullable().optional(),
});

export async function updateOption(
  optionId: string,
  patch: z.infer<typeof updateOptionSchema>,
) {
  const data = updateOptionSchema.parse(patch);
  if (Object.keys(data).length === 0) return;
  await db.update(options).set(data).where(eq(options.id, optionId));
}

/**
 * For single-answer scored questions we keep exactly one correct option.
 * Sets `optionId` correct and clears the others in the same question.
 */
export async function setCorrectOption(questionId: string, optionId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(options)
      .set({ isCorrect: false })
      .where(eq(options.questionId, questionId));
    await tx.update(options).set({ isCorrect: true }).where(eq(options.id, optionId));
  });
}

export async function deleteOption(optionId: string) {
  const [row] = await db
    .select({ questionId: options.questionId, position: options.position })
    .from(options)
    .where(eq(options.id, optionId));
  if (!row) return;

  await db.delete(options).where(eq(options.id, optionId));
  await db
    .update(options)
    .set({ position: sql`${options.position} - 1` })
    .where(
      and(
        eq(options.questionId, row.questionId),
        sql`${options.position} > ${row.position}`,
      ),
    );
}

/* ------------------------------------------------------------------ *
 *  loader (used by the builder page)
 * ------------------------------------------------------------------ */

export async function getQuizForEdit(quizId: string) {
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, quizId),
    with: {
      questions: {
        orderBy: asc(questions.position),
        with: { options: { orderBy: asc(options.position) } },
      },
    },
  });
  return quiz ?? null;
}
