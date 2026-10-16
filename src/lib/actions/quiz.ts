"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { options, questions, quizzes, uploads } from "@/lib/db/schema";
import { DEFAULTS, OPTION_COLORS } from "@/lib/quiz-constants";
import {
  requireQuizOwner,
  requireQuestionOwner,
  requireOptionOwner,
} from "@/lib/quiz-access";
import { isMediaUrl, isUploadUrl } from "@/lib/media";
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
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in to create a quiz.");
  const data = createQuizSchema.parse(input);
  const [quiz] = await db
    .insert(quizzes)
    .values({
      title: data.title,
      coverIcon: data.coverIcon,
      theme: data.theme,
      ownerId: user.id,
    })
    .returning({ id: quizzes.id });
  return quiz.id;
}

const quizSettingsSchema = z.object({
  coverImage: z.string().max(2048).refine(isMediaUrl).nullable().optional(),
  iconImage: z.string().max(2048).refine(isMediaUrl).nullable().optional(),
  speedBonus: z.boolean().optional(),
  powerups: z.boolean().optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  allowLateJoin: z.boolean().optional(),
  revealAnswers: z.enum(["per_question", "at_end", "never"]).optional(),
  leaderboard: z.enum(["per_question", "at_end", "never"]).optional(),
  participation: z
    .enum(["anonymous", "one_per_device", "signed_in"])
    .optional(),
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
  await requireQuizOwner(quizId);
  const data = updateQuizSchema.parse(patch);
  if (Object.keys(data).length === 0) return;
  await db
    .update(quizzes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(quizzes.id, quizId));
}

export async function deleteQuiz(quizId: string): Promise<{ ok: boolean }> {
  await requireQuizOwner(quizId, false);
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, quizId),
    columns: { id: true, ownerId: true },
  });
  if (!quiz) return { ok: true };
  if (quiz.ownerId && quiz.ownerId !== user.id) return { ok: false };
  // cascades to questions, options, sessions, participants, answers
  await db.delete(quizzes).where(eq(quizzes.id, quizId));
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 *  questions
 * ------------------------------------------------------------------ */

export async function addQuestion(
  quizId: string,
  type: QuestionType,
): Promise<QuestionWithOptions> {
  await requireQuizOwner(quizId);
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
  mediaUrl: z
    .string()
    .max(2048)
    .refine(isMediaUrl, "Use a public HTTPS media URL")
    .nullable()
    .optional(),
  prompt: z.string().max(300).optional(),
  timeLimitSec: z.number().int().min(5).max(300).optional(),
  points: z.number().int().min(0).max(5000).optional(),
  settings: z
    .object({
      scaleMin: z.number().int().min(0).max(9).optional(),
      scaleMax: z.number().int().min(1).max(10).optional(),
      scaleMinLabel: z.string().max(40).optional(),
      scaleMaxLabel: z.string().max(40).optional(),
      maxWords: z.number().int().min(1).max(10).optional(),
      speedBonus: z.boolean().nullable().optional(),
    })
    .optional(),
});

export async function updateQuestion(
  questionId: string,
  patch: z.infer<typeof updateQuestionSchema>,
) {
  const question = await requireQuestionOwner(questionId);
  const data = updateQuestionSchema.parse(patch);
  if (data.settings) {
    data.settings = { ...question.settings, ...data.settings };
    if ((data.settings.scaleMin ?? 1) >= (data.settings.scaleMax ?? 5))
      throw new Error("The scale maximum must be greater than the minimum.");
  }
  if (Object.keys(data).length === 0) return;
  await db.update(questions).set(data).where(eq(questions.id, questionId));
}

export async function deleteQuestion(questionId: string) {
  await requireQuestionOwner(questionId);
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
  await requireQuizOwner(quizId);
  z.array(z.string().uuid()).parse(orderedIds);
  const existing = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.quizId, quizId));
  if (
    new Set(orderedIds).size !== existing.length ||
    orderedIds.length !== existing.length ||
    existing.some((q) => !orderedIds.includes(q.id))
  ) {
    throw new Error("Question order must contain every question exactly once.");
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(questions)
        .set({ position: i })
        .where(
          and(eq(questions.id, orderedIds[i]), eq(questions.quizId, quizId)),
        );
    }
  });
}

/* ------------------------------------------------------------------ *
 *  options
 * ------------------------------------------------------------------ */

export async function addOption(questionId: string): Promise<OptionRow> {
  const question = await requireQuestionOwner(questionId);
  if (!["multiple_choice", "poll"].includes(question.type))
    throw new Error("This question has fixed options.");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(options)
    .where(eq(options.questionId, questionId));

  if (count >= DEFAULTS.maxOptions)
    throw new Error("Maximum number of options reached.");
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
  await requireOptionOwner(optionId);
  const data = updateOptionSchema.parse(patch);
  if (Object.keys(data).length === 0) return;
  await db.update(options).set(data).where(eq(options.id, optionId));
}

/**
 * For single-answer scored questions we keep exactly one correct option.
 * Sets `optionId` correct and clears the others in the same question.
 */
export async function setCorrectOption(questionId: string, optionId: string) {
  await requireQuestionOwner(questionId);
  const option = await requireOptionOwner(optionId);
  if (option.questionId !== questionId)
    throw new Error("Option belongs to a different question.");
  await db.transaction(async (tx) => {
    await tx
      .update(options)
      .set({ isCorrect: false })
      .where(eq(options.questionId, questionId));
    await tx
      .update(options)
      .set({ isCorrect: true })
      .where(eq(options.id, optionId));
  });
}

export async function deleteOption(optionId: string) {
  await requireOptionOwner(optionId);
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
  await requireQuizOwner(quizId, false);
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

export async function duplicateQuiz(quizId: string): Promise<string> {
  const original = await getQuizForEdit(quizId);
  if (!original) throw new Error("Quiz not found.");
  const ownerId = original.ownerId;
  return db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(quizzes)
      .values({
        ownerId: original.ownerId,
        title: `${original.title.slice(0, 113)} (copy)`,
        description: original.description,
        coverIcon: original.coverIcon,
        theme: original.theme,
        settings: original.settings,
      })
      .returning();
    const assetCopies = new Map<string, string>();
    async function copyAsset(url: string | null | undefined) {
      if (!url || !isUploadUrl(url)) return url;
      if (assetCopies.has(url)) return assetCopies.get(url)!;
      const [asset] = await tx
        .select()
        .from(uploads)
        .where(eq(uploads.id, url.split("/").at(-1)!));
      if (!asset) return null;
      const [cloned] = await tx
        .insert(uploads)
        .values({
          quizId: copy.id,
          ownerId,
          contentType: asset.contentType,
          data: asset.data,
        })
        .returning({ id: uploads.id });
      const next = `/api/v1/uploads/${cloned.id}`;
      assetCopies.set(url, next);
      return next;
    }
    await tx
      .update(quizzes)
      .set({
        settings: {
          ...original.settings,
          coverImage: await copyAsset(original.settings.coverImage),
          iconImage: await copyAsset(original.settings.iconImage),
        },
      })
      .where(eq(quizzes.id, copy.id));
    for (const q of original.questions) {
      const [question] = await tx
        .insert(questions)
        .values({
          quizId: copy.id,
          type: q.type,
          position: q.position,
          prompt: q.prompt,
          mediaUrl: await copyAsset(q.mediaUrl),
          points: q.points,
          timeLimitSec: q.timeLimitSec,
          settings: q.settings,
        })
        .returning();
      if (q.options.length)
        await tx.insert(options).values(
          q.options.map((o) => ({
            questionId: question.id,
            position: o.position,
            label: o.label,
            color: o.color,
            isCorrect: o.isCorrect,
          })),
        );
    }
    return copy.id;
  });
}
