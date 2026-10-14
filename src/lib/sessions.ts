import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  answers,
  options,
  participants,
  questions,
  quizzes,
  sessions,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/api/http";
import { generateJoinCode, generateToken } from "@/lib/codes";
import { QUESTION_TYPES, OPTION_COLORS } from "@/lib/quiz-constants";
import { clampResponseMs, computePoints } from "@/lib/scoring";
import type { z } from "zod";
import type {
  CreateSessionBody,
  JoinBody,
  SubmitAnswerBody,
} from "@/lib/api/schemas";

type SessionRow = typeof sessions.$inferSelect;

/* ----------------------------- helpers ------------------------------ */

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** Deterministic avatar color from a nickname, so it is stable per name. */
function colorFor(nickname: string): string {
  let h = 0;
  for (const ch of nickname) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return OPTION_COLORS[h % OPTION_COLORS.length];
}

/** Whether a scheduled session is currently inside its open window. */
function scheduledOpen(s: SessionRow): boolean {
  if (s.mode !== "scheduled") return false;
  const now = Date.now();
  const opens = s.opensAt ? s.opensAt.getTime() : Number.NEGATIVE_INFINITY;
  const closes = s.closesAt ? s.closesAt.getTime() : Number.POSITIVE_INFINITY;
  return now >= opens && now <= closes;
}

/** Most recent session for a code (codes are unique among non-ended runs). */
async function getSessionRow(code: string): Promise<SessionRow | undefined> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.code, code))
    .orderBy(desc(sessions.createdAt))
    .limit(1);
  return row;
}

async function requireSession(code: string): Promise<SessionRow> {
  const s = await getSessionRow(code);
  if (!s) throw new HttpError(404, "session_not_found", "Session not found");
  return s;
}

async function getParticipant(sessionId: string, clientToken: string) {
  const [p] = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.sessionId, sessionId),
        eq(participants.clientToken, clientToken),
      ),
    )
    .limit(1);
  return p;
}

/**
 * Detects a Postgres unique-violation (SQLSTATE 23505). Drizzle wraps the driver
 * error, so the real code can sit on the error or on its `cause`.
 */
function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++) {
    if (typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505") {
      return true;
    }
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/* ----------------------------- create ------------------------------- */

export async function createSession(input: z.infer<typeof CreateSessionBody>) {
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, input.quizId),
    columns: { id: true },
  });
  if (!quiz) throw new HttpError(404, "quiz_not_found", "Quiz not found");

  let opensAt: Date | null = null;
  let closesAt: Date | null = null;
  let status: "lobby" | "active" = "lobby";

  if (input.mode === "scheduled") {
    if (!input.opensAt || !input.closesAt) {
      throw new HttpError(
        422,
        "validation_error",
        "Scheduled sessions require opensAt and closesAt",
      );
    }
    opensAt = new Date(input.opensAt);
    closesAt = new Date(input.closesAt);
    if (Number.isNaN(+opensAt) || Number.isNaN(+closesAt)) {
      throw new HttpError(422, "validation_error", "opensAt and closesAt must be valid datetimes");
    }
    if (closesAt <= opensAt) {
      throw new HttpError(422, "validation_error", "closesAt must be after opensAt");
    }
    status = "active"; // openness is gated by the window, not the status
  }

  const hostToken = generateToken();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateJoinCode();
    try {
      const [s] = await db
        .insert(sessions)
        .values({ quizId: input.quizId, mode: input.mode, status, hostToken, code, opensAt, closesAt })
        .returning();
      return {
        id: s.id,
        code: s.code,
        mode: s.mode,
        status: s.status,
        opensAt: iso(s.opensAt),
        closesAt: iso(s.closesAt),
        hostToken: s.hostToken,
      };
    } catch (err) {
      if (isUniqueViolation(err)) continue; // code collision, retry
      throw err;
    }
  }
  throw new HttpError(500, "code_generation_failed", "Could not allocate a unique join code");
}

/* --------------------------- public info ---------------------------- */

export async function getPublicSession(code: string) {
  const s = await requireSession(code);
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, s.quizId),
    columns: { title: true, coverIcon: true, theme: true },
  });
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participants)
    .where(eq(participants.sessionId, s.id));

  return {
    id: s.id,
    code: s.code,
    mode: s.mode,
    status: s.status,
    opensAt: iso(s.opensAt),
    closesAt: iso(s.closesAt),
    participantCount: count,
    participation: "anonymous" as const,
    quiz: {
      title: quiz?.title ?? "",
      coverIcon: quiz?.coverIcon ?? "shapes",
      theme: quiz?.theme ?? "grape",
    },
  };
}

/* ------------------------------ join -------------------------------- */

export async function joinSession(code: string, input: z.infer<typeof JoinBody>) {
  const s = await requireSession(code);
  if (s.status === "ended") {
    throw new HttpError(409, "session_ended", "This session has ended");
  }
  if (s.mode === "scheduled" && !scheduledOpen(s)) {
    throw new HttpError(409, "session_not_open", "This session is not open right now");
  }

  const clientToken = generateToken();
  const avatarColor = input.avatarColor ?? colorFor(input.nickname);
  const [p] = await db
    .insert(participants)
    .values({ sessionId: s.id, nickname: input.nickname, avatarColor, clientToken })
    .returning();

  return { id: p.id, nickname: p.nickname, avatarColor: p.avatarColor, clientToken };
}

/* --------------------------- questions ------------------------------ */

export async function listQuestions(code: string, clientToken: string | null) {
  const s = await requireSession(code);
  if (s.mode !== "scheduled") {
    throw new HttpError(409, "not_scheduled", "This endpoint is for scheduled sessions");
  }
  if (!scheduledOpen(s)) {
    throw new HttpError(409, "session_not_open", "This session is not open right now");
  }
  if (!clientToken) {
    throw new HttpError(401, "missing_token", "A participant client token is required");
  }
  const participant = await getParticipant(s.id, clientToken);
  if (!participant) {
    throw new HttpError(401, "invalid_token", "Unknown participant");
  }

  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, s.quizId),
    with: {
      questions: {
        orderBy: asc(questions.position),
        with: { options: { orderBy: asc(options.position) } },
      },
    },
  });

  // which questions this participant has already answered (for resume)
  const answered = await db
    .select({ questionId: answers.questionId })
    .from(answers)
    .where(and(eq(answers.sessionId, s.id), eq(answers.participantId, participant.id)));

  return {
    answered: answered.map((a) => a.questionId),
    questions: (quiz?.questions ?? []).map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      prompt: q.prompt,
      timeLimitSec: q.timeLimitSec,
      points: q.points,
      settings: q.settings ?? {},
      options: q.options.map((o) => ({
        id: o.id,
        position: o.position,
        label: o.label,
        color: o.color,
      })),
    })),
  };
}

/* ---------------------------- submit -------------------------------- */

export async function submitAnswer(
  code: string,
  input: z.infer<typeof SubmitAnswerBody>,
) {
  const s = await requireSession(code);
  const participant = await getParticipant(s.id, input.clientToken);
  if (!participant) {
    throw new HttpError(404, "participant_not_found", "Unknown participant");
  }

  const q = await db.query.questions.findFirst({
    where: and(eq(questions.id, input.questionId), eq(questions.quizId, s.quizId)),
    with: { options: true },
  });
  if (!q) throw new HttpError(404, "question_not_found", "Question not found in this quiz");

  // is the session accepting answers for this question right now
  if (s.mode === "scheduled") {
    if (!scheduledOpen(s)) {
      throw new HttpError(409, "session_not_open", "This session is not open right now");
    }
  } else {
    if (s.status !== "active" || s.currentQuestionId !== q.id) {
      throw new HttpError(409, "not_current_question", "That question is not live");
    }
  }

  const meta = QUESTION_TYPES[q.type];
  let optionId: string | null = null;
  let textValue: string | null = null;
  let numberValue: number | null = null;
  let isCorrect = false;
  let correctOptionId: string | null = null;

  if (meta.hasOptions) {
    if (!input.optionId) {
      throw new HttpError(422, "missing_option", "This question needs an optionId");
    }
    const opt = q.options.find((o) => o.id === input.optionId);
    if (!opt) throw new HttpError(422, "invalid_option", "That option is not part of this question");
    optionId = opt.id;
    if (meta.scorable) {
      isCorrect = opt.isCorrect;
      correctOptionId = q.options.find((o) => o.isCorrect)?.id ?? null;
    }
  } else if (q.type === "scale") {
    if (input.numberValue == null) {
      throw new HttpError(422, "missing_number", "This question needs a numberValue");
    }
    numberValue = input.numberValue;
  } else {
    // word_cloud or open_text
    const text = input.textValue?.trim();
    if (!text) throw new HttpError(422, "missing_text", "This question needs a textValue");
    textValue = text;
  }

  let responseMs: number | null = null;
  if (s.mode === "scheduled") {
    responseMs = clampResponseMs(input.elapsedMs, q.timeLimitSec);
  } else if (s.questionStartedAt) {
    responseMs = clampResponseMs(Date.now() - s.questionStartedAt.getTime(), q.timeLimitSec);
  }

  const points = computePoints({
    scorable: meta.scorable,
    isCorrect,
    basePoints: q.points,
    timeLimitSec: q.timeLimitSec,
    responseMs,
    speedBonus: Boolean(q.settings?.speedBonus),
  });

  try {
    await db.insert(answers).values({
      sessionId: s.id,
      questionId: q.id,
      participantId: participant.id,
      optionId,
      textValue,
      numberValue,
      isCorrect,
      responseMs,
      points,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, "already_answered", "You have already answered this question");
    }
    throw err;
  }

  if (points > 0) {
    await db
      .update(participants)
      .set({ score: sql`${participants.score} + ${points}` })
      .where(eq(participants.id, participant.id));
  }

  return {
    accepted: true as const,
    revealed: true,
    isCorrect,
    pointsAwarded: points,
    correctOptionId,
  };
}

/* ---------------------------- results ------------------------------- */

export async function getResults(code: string) {
  const s = await requireSession(code);

  const parts = await db
    .select()
    .from(participants)
    .where(eq(participants.sessionId, s.id))
    .orderBy(desc(participants.score), asc(participants.joinedAt));

  const leaderboard = parts.map((p, i) => ({
    participantId: p.id,
    nickname: p.nickname,
    avatarColor: p.avatarColor,
    score: p.score,
    rank: i + 1,
  }));

  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, s.quizId),
    with: {
      questions: {
        orderBy: asc(questions.position),
        with: { options: { orderBy: asc(options.position) } },
      },
    },
  });

  const allAnswers = await db
    .select()
    .from(answers)
    .where(eq(answers.sessionId, s.id));

  const byQuestion = new Map<string, typeof allAnswers>();
  for (const a of allAnswers) {
    const list = byQuestion.get(a.questionId) ?? [];
    list.push(a);
    byQuestion.set(a.questionId, list);
  }

  const questionStats = (quiz?.questions ?? []).map((q) => {
    const list = byQuestion.get(q.id) ?? [];
    const meta = QUESTION_TYPES[q.type];

    const optionTallies = meta.hasOptions
      ? q.options.map((o) => ({
          optionId: o.id,
          label: o.label,
          count: list.filter((a) => a.optionId === o.id).length,
          isCorrect: o.isCorrect,
        }))
      : [];

    const textValues =
      q.type === "word_cloud" || q.type === "open_text"
        ? list.map((a) => a.textValue).filter((v): v is string => Boolean(v))
        : [];

    const numbers =
      q.type === "scale"
        ? list.map((a) => a.numberValue).filter((v): v is number => v != null)
        : [];
    const numberAverage =
      numbers.length > 0 ? numbers.reduce((s, n) => s + n, 0) / numbers.length : null;

    return {
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      responses: list.length,
      options: optionTallies,
      textValues,
      numberAverage,
    };
  });

  return {
    totalParticipants: parts.length,
    over: false,
    showAnswers: true,
    showBoard: true,
    leaderboard,
    questionStats,
  };
}
