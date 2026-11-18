import { z } from "zod";
import type { QuestionType, QuizSettings, QuestionSettings } from "./db/schema-types";

export const PORTABLE_QUIZ_SCHEMA_VERSION = "1.0.0";

const QuestionTypeSchema = z.enum([
  "multiple_choice",
  "true_false",
  "poll",
  "word_cloud",
  "scale",
  "open_text"
]);

const PowerupSchema = z.enum(["double", "shield", "safety_net", "attack"]);

const QuestionSettingsSchema = z.object({
  scaleMin: z.number().int().optional(),
  scaleMax: z.number().int().optional(),
  scaleMinLabel: z.string().max(100).optional(),
  scaleMaxLabel: z.string().max(100).optional(),
  maxWords: z.number().int().positive().optional(),
  speedBonus: z.boolean().nullable().optional()
}).strict();

const PortableOptionSchema = z.object({
  position: z.number().int().min(0),
  label: z.string().min(1).max(500),
  isCorrect: z.boolean().default(false),
  color: z.string().nullable().optional()
}).strict();

const PortableQuestionSchema = z.object({
  position: z.number().int().min(0),
  type: QuestionTypeSchema,
  prompt: z.string().min(1).max(2000),
  mediaUrl: z.string().url().nullable().optional(),
  timeLimitSec: z.number().int().min(5).max(300).default(30),
  points: z.number().int().min(0).max(10000).default(1000),
  settings: QuestionSettingsSchema.default({}),
  options: z.array(PortableOptionSchema).default([])
}).strict();

const PortableQuizSettingsSchema = z.object({
  teamSelection: z.boolean().optional(),
  teamNames: z.array(z.string().min(1).max(100)).optional(),
  teamSize: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  coverImage: z.string().url().nullable().optional(),
  iconImage: z.string().url().nullable().optional(),
  speedBonus: z.boolean().optional(),
  powerups: z.boolean().optional(),
  powerupUses: z.number().int().min(1).max(3).optional(),
  powerupTypes: z.array(PowerupSchema).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  allowLateJoin: z.boolean().optional(),
  revealAnswers: z.enum(["per_question", "at_end", "never"]).optional(),
  leaderboard: z.enum(["per_question", "at_end", "never"]).optional(),
  participation: z.enum(["anonymous", "one_per_device", "signed_in"]).optional()
}).strict();

export const PortableQuizSchema = z.object({
  schemaVersion: z.literal(PORTABLE_QUIZ_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  generator: z.string().default("Quizza-Engine"),
  quiz: z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(2000).nullable().default(null),
    settings: PortableQuizSettingsSchema.default({}),
    questions: z.array(PortableQuestionSchema).min(1, "A portable quiz must contain at least one question")
  }).strict()
}).strict();

export type PortableQuiz = z.infer<typeof PortableQuizSchema>;
export type PortableQuestion = z.infer<typeof PortableQuestionSchema>;
export type PortableOption = z.infer<typeof PortableOptionSchema>;

export type PortableQuizValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary?: {
    title: string;
    description: string | null;
    questionCount: number;
    totalPoints: number;
    questionTypes: Record<QuestionType, number>;
  };
};

/**
 * Validates untrusted raw JSON input against the portable quiz schema and business rules.
 */
export function validatePortableQuiz(rawJson: unknown): PortableQuizValidationResult {
  const parseResult = PortableQuizSchema.safeParse(rawJson);
  if (!parseResult.success) {
    const issues = parseResult.error.issues || [];
    const errors = issues.map(err => {
      const path = err.path.join(".");
      return `${path ? path + ": " : ""}${err.message}`;
    });
    return {
      valid: false,
      errors,
      warnings: []
    };
  }

  const data = parseResult.data;
  const warnings: string[] = [];
  const errors: string[] = [];

  const questionTypes: Record<QuestionType, number> = {
    multiple_choice: 0,
    true_false: 0,
    poll: 0,
    word_cloud: 0,
    scale: 0,
    open_text: 0
  };

  let totalPoints = 0;

  data.quiz.questions.forEach((q, idx) => {
    questionTypes[q.type] = (questionTypes[q.type] || 0) + 1;
    totalPoints += q.points;

    if (q.type === "multiple_choice" || q.type === "true_false") {
      if (q.options.length < 2) {
        errors.push(`Question ${idx + 1} (${q.type}): must have at least 2 options.`);
      }
      const hasCorrect = q.options.some(opt => opt.isCorrect);
      if (!hasCorrect) {
        errors.push(`Question ${idx + 1} (${q.type}): must have at least one correct option marked.`);
      }
    } else if (q.type === "scale") {
      const min = q.settings.scaleMin ?? 1;
      const max = q.settings.scaleMax ?? 5;
      if (min >= max) {
        errors.push(`Question ${idx + 1} (scale): scaleMin (${min}) must be strictly less than scaleMax (${max}).`);
      }
    }

    if (q.mediaUrl && !q.mediaUrl.startsWith("https://")) {
      warnings.push(`Question ${idx + 1}: mediaUrl does not use HTTPS (${q.mediaUrl}).`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: errors.length === 0 ? {
      title: data.quiz.title,
      description: data.quiz.description,
      questionCount: data.quiz.questions.length,
      totalPoints,
      questionTypes
    } : undefined
  };
}

/**
 * Sanitizes and exports a quiz row + questions into the versioned portable format.
 * Strips internal user IDs, database IDs, session history, and sensitive rosters.
 */
export function exportToPortableQuiz(
  quiz: { title: string; description: string | null; settings: QuizSettings },
  questions: Array<{
    position: number;
    type: QuestionType;
    prompt: string;
    mediaUrl: string | null;
    timeLimitSec: number;
    points: number;
    settings: QuestionSettings;
    options: Array<{
      position: number;
      label: string;
      isCorrect: boolean;
      color: string | null;
    }>;
  }>
): PortableQuiz {
  const settingsCopy = { ...quiz.settings };
  delete settingsCopy.teamRoster;
  delete settingsCopy.teamEmailVerification;

  return {
    schemaVersion: PORTABLE_QUIZ_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    generator: "Quizza-Engine",
    quiz: {
      title: quiz.title,
      description: quiz.description,
      settings: settingsCopy,
      questions: questions.map(q => ({
        position: q.position,
        type: q.type,
        prompt: q.prompt,
        mediaUrl: q.mediaUrl,
        timeLimitSec: q.timeLimitSec,
        points: q.points,
        settings: q.settings || {},
        options: (q.options || []).map(opt => ({
          position: opt.position,
          label: opt.label,
          isCorrect: Boolean(opt.isCorrect),
          color: opt.color ?? null
        }))
      }))
    }
  };
}
