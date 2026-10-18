import { z } from "zod";
import { OPTION_COLORS } from "@/lib/quiz-constants";

/**
 * Request and response schemas for the /api/v1 surface. These are used both for
 * runtime validation in the route handlers and to generate the OpenAPI document,
 * so the docs never drift from what the code accepts.
 */

export const colorEnum = z.enum(OPTION_COLORS);

export const questionTypeEnum = z.enum([
  "multiple_choice",
  "true_false",
  "poll",
  "word_cloud",
  "scale",
  "open_text",
]);

export const sessionModeEnum = z.enum(["live", "scheduled"]);
export const sessionStatusEnum = z.enum(["lobby", "active", "ended"]);

/* ----------------------------- requests ----------------------------- */

export const CreateSessionBody = z
  .object({
    quizId: z.string().uuid(),
    mode: sessionModeEnum.default("live"),
    // required for scheduled mode; ignored for live
    opensAt: z.string().describe("ISO 8601 datetime").optional(),
    closesAt: z.string().describe("ISO 8601 datetime").optional(),
  })
  .describe("Create a run (session) of a quiz");

export const JoinBody = z
  .object({
    nickname: z.string().trim().min(1).max(40),
    teamName: z.string().trim().min(1).max(80).optional(),
    email: z.email().trim().max(160).optional(),
    avatarColor: colorEnum.optional(),
  })
  .describe("Join a session as a participant");

export const SubmitAnswerBody = z
  .object({
    questionId: z.string().uuid(),
    clientToken: z.string().min(1),
    optionId: z.string().uuid().optional(),
    textValue: z.string().max(280).optional(),
    numberValue: z.number().int().optional(),
    // client-reported time taken; a fallback when no view token is present
    elapsedMs: z.number().int().min(0).optional(),
    // server-issued per-question view token (scheduled mode) for honest timing
    viewToken: z.string().optional(),
    powerup: z.enum(["double", "shield", "safety_net", "attack"]).optional(),
    powerupTargetId: z.string().uuid().optional(),
  })
  .describe("Submit one answer to a question");

/* ----------------------------- responses ---------------------------- */

export const SessionCreated = z.object({
  id: z.string().uuid(),
  code: z.string(),
  mode: sessionModeEnum,
  status: sessionStatusEnum,
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  // returned only at creation; the host keeps this secret
  hostToken: z.string(),
});

export const QuizSummary = z.object({
  title: z.string(),
  coverIcon: z.string(),
  theme: z.string(),
  coverImage: z.string().nullable().optional(),
  iconImage: z.string().nullable().optional(),
});

export const participationEnum = z.enum([
  "anonymous",
  "one_per_device",
  "signed_in",
]);

export const SessionPublic = z.object({
  id: z.string().uuid(),
  code: z.string(),
  mode: sessionModeEnum,
  status: sessionStatusEnum,
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  participantCount: z.number().int(),
  participation: participationEnum,
  teams: z.array(z.object({ name: z.string(), joined: z.number().int() })),
  teamSize: z.number().int().nullable(),
  teamEmailVerification: z.boolean(),
  powerups: z.boolean(),
  powerupUses: z.number().int(),
  powerupTypes: z.array(z.enum(["double", "shield", "safety_net", "attack"])),
  quiz: QuizSummary,
});

export const Participant = z.object({
  id: z.string().uuid(),
  nickname: z.string(),
  teamName: z.string().nullable(),
  avatarColor: z.string(),
  avatarUrl: z.string().nullable().optional(),
  // returned only at join; the client keeps this to reconnect and submit
  clientToken: z.string(),
});

export const OptionPublic = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  label: z.string(),
  color: z.string().nullable(),
});

export const QuestionPublic = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  type: questionTypeEnum,
  prompt: z.string(),
  mediaUrl: z.string().nullable(),
  timeLimitSec: z.number().int(),
  points: z.number().int(),
  settings: z.record(z.string(), z.unknown()),
  options: z.array(OptionPublic),
});

export const QuestionList = z.object({
  answered: z.array(z.string().uuid()),
  usedPowerups: z.array(z.enum(["double", "shield", "safety_net", "attack"])),
  questions: z.array(QuestionPublic),
});

export const ViewToken = z.object({
  viewToken: z.string(),
  startedAt: z.string(),
});
export const AnswerResult = z.object({
  accepted: z.literal(true),
  // whether correctness is revealed now (per the quiz's reveal policy)
  revealed: z.boolean(),
  isCorrect: z.boolean().nullable(),
  pointsAwarded: z.number().int().nullable(),
  correctOptionId: z.string().uuid().nullable(),
  attackStolen: z.number().int().optional(),
  attackBlocked: z.boolean().optional(),
  attackedLoss: z.number().int().optional(),
});

export const ParticipantProgress = z.object({
  answered: z.array(z.string().uuid()),
  usedPowerups: z.array(z.enum(["double", "shield", "safety_net", "attack"])),
  results: z.record(z.string(), AnswerResult),
});

export const LeaderboardEntry = z.object({
  participantId: z.string().uuid(),
  nickname: z.string(),
  teamName: z.string().nullable(),
  avatarColor: z.string(),
  avatarUrl: z.string().nullable().optional(),
  score: z.number().int(),
  rank: z.number().int(),
});

export const OptionTally = z.object({
  optionId: z.string().uuid(),
  label: z.string(),
  count: z.number().int(),
  isCorrect: z.boolean(),
});

export const QuestionStats = z.object({
  questionId: z.string().uuid(),
  prompt: z.string(),
  mediaUrl: z.string().nullable(),
  type: questionTypeEnum,
  responses: z.number().int(),
  options: z.array(OptionTally),
  textValues: z.array(z.string()),
  numberAverage: z.number().nullable(),
});

export const Results = z.object({
  totalParticipants: z.number().int(),
  over: z.boolean(),
  showAnswers: z.boolean(),
  showBoard: z.boolean(),
  leaderboard: z.array(LeaderboardEntry),
  questionStats: z.array(QuestionStats),
});

export const ControlBody = z
  .object({ action: z.enum(["start", "reveal", "next", "end"]) })
  .describe("Host control action for a live session");

export const Ok = z.object({ ok: z.literal(true) });
export const UploadCreated = z.object({ url: z.string() });

export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

/** Named registry consumed by the OpenAPI builder. */
export const apiSchemas = {
  CreateSessionBody,
  JoinBody,
  SubmitAnswerBody,
  SessionCreated,
  SessionPublic,
  Participant,
  QuestionPublic,
  QuestionList,
  ViewToken,
  ParticipantProgress,
  AnswerResult,
  LeaderboardEntry,
  QuestionStats,
  Results,
  ControlBody,
  Ok,
  UploadCreated,
  ApiError,
} as const;

export type ApiSchemaName = keyof typeof apiSchemas;
