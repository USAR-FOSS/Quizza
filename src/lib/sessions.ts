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
import { publish } from "@/lib/realtime/bus";
import { publishState } from "@/lib/realtime/snapshot";
import { generateJoinCode, generateToken } from "@/lib/codes";
import { QUESTION_TYPES, OPTION_COLORS } from "@/lib/quiz-constants";
import { clampResponseMs, computePoints } from "@/lib/scoring";
import {
  canRevealAnswers,
  canShowLeaderboard,
  participationMode,
  revealPolicy,
} from "@/lib/quiz-policy";
import { seededShuffle } from "@/lib/shuffle";
import { signViewToken, verifyViewToken } from "@/lib/view-token";
import { isClean } from "@/lib/moderation";
import type { z } from "zod";
import type { QuizSettings } from "@/lib/db/schema-types";
import type {
  CreateSessionBody,
  JoinBody,
  SubmitAnswerBody,
} from "@/lib/api/schemas";

type SessionRow = typeof sessions.$inferSelect;

/** Context the API routes gather from the request for the lib functions. */
export type JoinContext = { userId: string | null; deviceId: string | null };
export type ResultsContext = { hostToken: string | null; clientToken: string | null };

/** Whether a session has fully finished (window closed, or live ended). */
function isSessionOver(s: SessionRow): boolean {
  if (s.status === "ended") return true;
  if (s.mode === "scheduled" && s.closesAt) return Date.now() > s.closesAt.getTime();
  return false;
}

/**
 * Checks a quiz is launchable: it has questions, each has a prompt, option-based
 * questions have at least two options, and scorable ones have exactly one correct
 * option. Returns a list of human-readable problems (empty means ready).
 */
export async function validateQuizForLaunch(quizId: string): Promise<string[]> {
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, quizId),
    with: {
      questions: {
        orderBy: asc(questions.position),
        with: { options: true },
      },
    },
  });
  const problems: string[] = [];
  const qs = quiz?.questions ?? [];
  if (qs.length === 0) return ["Add at least one question."];

  qs.forEach((q, i) => {
    const n = i + 1;
    const meta = QUESTION_TYPES[q.type];
    if (!q.prompt.trim()) problems.push(`Question ${n} has no prompt.`);
    if (meta.hasOptions) {
      const filled = q.options.filter((o) => o.label.trim());
      if (filled.length < 2) problems.push(`Question ${n} needs at least two options.`);
      if (meta.scorable) {
        const correct = q.options.filter((o) => o.isCorrect).length;
        if (correct !== 1) {
          problems.push(`Question ${n} must have exactly one correct answer marked.`);
        }
      }
    }
  });
  return problems;
}

/** Load a session's quiz settings bag. */
async function sessionSettings(s: SessionRow): Promise<QuizSettings> {
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, s.quizId),
    columns: { settings: true },
  });
  return (quiz?.settings as QuizSettings) ?? {};
}

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
  if (!row) return undefined;

  // lazily end a scheduled session whose window has closed, freeing the code
  if (
    row.mode === "scheduled" &&
    row.status !== "ended" &&
    row.closesAt &&
    Date.now() > row.closesAt.getTime()
  ) {
    await db
      .update(sessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(sessions.id, row.id));
    return { ...row, status: "ended", endedAt: new Date() };
  }
  return row;
}

async function requireSession(code: string): Promise<SessionRow> {
  const s = await getSessionRow(code);
  if (!s) throw new HttpError(404, "session_not_found", "Session not found");
  return s;
}

/** Resolve the current (most recent) session row for a code. For the SSE route. */
export async function resolveSession(code: string) {
  return getSessionRow(code);
}

/** Validate a participant's client token within a session. For the SSE route. */
export async function getParticipantByToken(sessionId: string, clientToken: string) {
  return getParticipant(sessionId, clientToken);
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

export async function createSession(
  input: z.infer<typeof CreateSessionBody>,
  ownerUserId: string | null,
) {
  if (!ownerUserId) {
    throw new HttpError(401, "signin_required", "Sign in to run a quiz");
  }
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, input.quizId),
    columns: { id: true, ownerId: true },
  });
  if (!quiz) throw new HttpError(404, "quiz_not_found", "Quiz not found");
  if (quiz.ownerId && quiz.ownerId !== ownerUserId) {
    throw new HttpError(403, "forbidden", "You do not own this quiz");
  }

  const problems = await validateQuizForLaunch(input.quizId);
  if (problems.length) {
    throw new HttpError(422, "quiz_invalid", "This quiz is not ready to launch", problems);
  }

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
    columns: { title: true, coverIcon: true, theme: true, settings: true },
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
    participation: participationMode((quiz?.settings as QuizSettings) ?? {}),
    quiz: {
      title: quiz?.title ?? "",
      coverIcon: quiz?.coverIcon ?? "shapes",
      theme: quiz?.theme ?? "grape",
    },
  };
}

/* ------------------------------ join -------------------------------- */

export async function joinSession(
  code: string,
  input: z.infer<typeof JoinBody>,
  ctx: JoinContext,
) {
  const s = await requireSession(code);
  if (s.status === "ended") {
    throw new HttpError(409, "session_ended", "This session has ended");
  }
  if (s.mode === "scheduled" && !scheduledOpen(s)) {
    throw new HttpError(409, "session_not_open", "This session is not open right now");
  }
  if (!isClean(input.nickname)) {
    throw new HttpError(422, "nickname_rejected", "Please choose a different nickname");
  }

  const mode = participationMode(await sessionSettings(s));

  // identity keys for replay prevention
  const userId = mode === "signed_in" ? ctx.userId : null;
  const deviceId = mode === "one_per_device" ? ctx.deviceId : null;

  if (mode === "signed_in" && !userId) {
    throw new HttpError(401, "signin_required", "Sign in to join this quiz");
  }

  // resume: if this account/device already joined, return the existing attempt
  // instead of creating a second one (prevents replay).
  if (userId || deviceId) {
    const existing = await findExistingParticipant(s.id, userId, deviceId);
    if (existing) return participantView(existing);
  }

  const clientToken = generateToken();
  const avatarColor = input.avatarColor ?? colorFor(input.nickname);
  try {
    const [p] = await db
      .insert(participants)
      .values({
        sessionId: s.id,
        nickname: input.nickname,
        avatarColor,
        clientToken,
        userId,
        deviceId,
      })
      .returning();
    if (s.mode === "live") await publishState(s.id);
    return participantView(p);
  } catch (err) {
    // lost a race on the per-user/per-device unique index: return the winner
    if (isUniqueViolation(err) && (userId || deviceId)) {
      const existing = await findExistingParticipant(s.id, userId, deviceId);
      if (existing) return participantView(existing);
    }
    throw err;
  }
}

function participantView(p: typeof participants.$inferSelect) {
  return { id: p.id, nickname: p.nickname, avatarColor: p.avatarColor, clientToken: p.clientToken };
}

async function findExistingParticipant(
  sessionId: string,
  userId: string | null,
  deviceId: string | null,
) {
  if (userId) {
    const [p] = await db
      .select()
      .from(participants)
      .where(and(eq(participants.sessionId, sessionId), eq(participants.userId, userId)))
      .limit(1);
    if (p) return p;
  }
  if (deviceId) {
    const [p] = await db
      .select()
      .from(participants)
      .where(and(eq(participants.sessionId, sessionId), eq(participants.deviceId, deviceId)))
      .limit(1);
    if (p) return p;
  }
  return undefined;
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

  const settings = (quiz?.settings as QuizSettings) ?? {};
  let qlist = quiz?.questions ?? [];
  // deterministic per-participant shuffle, so order is stable across reloads
  if (settings.shuffleQuestions) qlist = seededShuffle(qlist, `q:${participant.id}`);

  // which questions this participant has already answered, so the client can
  // resume at the right place after a refresh.
  const answered = await db
    .select({ questionId: answers.questionId })
    .from(answers)
    .where(and(eq(answers.sessionId, s.id), eq(answers.participantId, participant.id)));

  return {
    answered: answered.map((a) => a.questionId),
    questions: qlist.map((q) => {
      const opts = settings.shuffleOptions
        ? seededShuffle(q.options, `o:${participant.id}:${q.id}`)
        : q.options;
      return {
        id: q.id,
        position: q.position,
        type: q.type,
        prompt: q.prompt,
        timeLimitSec: q.timeLimitSec,
        points: q.points,
        settings: q.settings ?? {},
        options: opts.map((o) => ({
          id: o.id,
          position: o.position,
          label: o.label,
          color: o.color,
        })),
      };
    }),
  };
}

/**
 * Issues a server-timestamped view token for one question. The scheduled player
 * calls this when it displays a question, so response time is measured from a
 * moment the server controls.
 */
export async function issueViewToken(
  code: string,
  questionId: string,
  clientToken: string | null,
) {
  const s = await requireSession(code);
  if (!clientToken) throw new HttpError(401, "missing_token", "A client token is required");
  const participant = await getParticipant(s.id, clientToken);
  if (!participant) throw new HttpError(401, "invalid_token", "Unknown participant");
  const q = await db.query.questions.findFirst({
    where: and(eq(questions.id, questionId), eq(questions.quizId, s.quizId)),
    columns: { id: true },
  });
  if (!q) throw new HttpError(404, "question_not_found", "Question not found");
  return { viewToken: signViewToken(s.id, q.id, participant.id) };
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
    if (!isClean(text)) throw new HttpError(422, "text_rejected", "Please rephrase your answer");
    textValue = text;
  }

  let responseMs: number | null = null;
  if (s.mode === "scheduled") {
    // prefer the server-anchored view token; fall back to the client report
    if (input.viewToken) {
      const issuedAt = verifyViewToken(input.viewToken, s.id, q.id, participant.id);
      if (issuedAt != null) responseMs = clampResponseMs(Date.now() - issuedAt, q.timeLimitSec);
    }
    if (responseMs == null) responseMs = clampResponseMs(input.elapsedMs, q.timeLimitSec);
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

  // live: tell the host how many have answered this question (host connection only)
  if (s.mode === "live") {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(answers)
      .where(and(eq(answers.sessionId, s.id), eq(answers.questionId, q.id)));
    publish(s.id, { kind: "tick", answeredCount: count });
  }

  // reveal gating: only return correctness when the quiz reveals it per-question.
  // Otherwise the answer is recorded silently (shown later per policy).
  const reveal = revealPolicy(await sessionSettings(s)) === "per_question";
  return {
    accepted: true as const,
    revealed: reveal,
    isCorrect: reveal ? isCorrect : null,
    pointsAwarded: reveal ? points : null,
    correctOptionId: reveal ? correctOptionId : null,
  };
}

/* ---------------------------- results ------------------------------- */

export async function getResults(code: string, ctx: ResultsContext) {
  const s = await requireSession(code);

  // The host (holding the host token) always sees everything. Everyone else is
  // subject to the quiz's reveal and leaderboard policy, and only once the
  // session is over for aggregate views, so an open scheduled quiz does not leak
  // answers or standings mid-run.
  const isHost = Boolean(ctx.hostToken && ctx.hostToken === s.hostToken);
  const over = isSessionOver(s);
  const settings = await sessionSettings(s);
  const showAnswers = isHost || canRevealAnswers(settings, over);
  const showBoard = isHost || canShowLeaderboard(settings, over);

  const parts = await db
    .select()
    .from(participants)
    .where(eq(participants.sessionId, s.id))
    .orderBy(desc(participants.score), asc(participants.joinedAt));

  const leaderboard = showBoard
    ? parts.map((p, i) => ({
        participantId: p.id,
        nickname: p.nickname,
        avatarColor: p.avatarColor,
        score: p.score,
        rank: i + 1,
      }))
    : [];

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
          // correctness is withheld unless the policy allows it
          isCorrect: showAnswers ? o.isCorrect : false,
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
    over,
    showAnswers,
    showBoard,
    leaderboard,
    questionStats,
  };
}

/* ---------------------------- export -------------------------------- */

function csvField(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Host-only CSV of every answer. Throws 403 without the host token. */
export async function exportCsv(code: string, hostToken: string | null): Promise<string> {
  const s = await requireSession(code);
  if (!hostToken || hostToken !== s.hostToken) {
    throw new HttpError(403, "forbidden", "Host token required");
  }

  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, s.quizId),
    with: {
      questions: { orderBy: asc(questions.position), with: { options: true } },
    },
  });
  const parts = await db.select().from(participants).where(eq(participants.sessionId, s.id));
  const allAnswers = await db.select().from(answers).where(eq(answers.sessionId, s.id));

  const partById = new Map(parts.map((p) => [p.id, p]));
  const qById = new Map((quiz?.questions ?? []).map((q) => [q.id, q]));

  const header = ["nickname", "score", "question", "answer", "correct", "response_ms", "points"];
  const rows = [header.map(csvField).join(",")];

  for (const a of allAnswers) {
    const p = partById.get(a.participantId);
    const q = qById.get(a.questionId);
    const answerText =
      a.optionId != null
        ? q?.options.find((o) => o.id === a.optionId)?.label ?? ""
        : a.textValue ?? (a.numberValue != null ? String(a.numberValue) : "");
    rows.push(
      [
        csvField(p?.nickname),
        csvField(p?.score),
        csvField(q?.prompt),
        csvField(answerText),
        csvField(a.isCorrect ? "yes" : "no"),
        csvField(a.responseMs),
        csvField(a.points),
      ].join(","),
    );
  }
  return rows.join("\n");
}

/* ------------------------- live host control ------------------------ */

export type LiveAction = "start" | "reveal" | "next" | "end";

/** Host-only control of a live session. Requires the host token. */
export async function controlSession(
  code: string,
  hostToken: string,
  action: LiveAction,
) {
  const s = await requireSession(code);
  if (s.hostToken !== hostToken) {
    throw new HttpError(403, "forbidden", "Invalid host token");
  }
  if (s.mode !== "live") {
    throw new HttpError(409, "not_live", "Only live sessions can be controlled");
  }

  const qrows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.quizId, s.quizId))
    .orderBy(asc(questions.position));
  const total = qrows.length;
  const curIdx = s.currentQuestionId
    ? qrows.findIndex((q) => q.id === s.currentQuestionId)
    : -1;

  if (action === "start") {
    if (total === 0) throw new HttpError(409, "no_questions", "Add questions first");
    await db
      .update(sessions)
      .set({
        status: "active",
        currentQuestionId: qrows[0].id,
        questionStartedAt: new Date(),
        revealed: false,
      })
      .where(eq(sessions.id, s.id));
  } else if (action === "reveal") {
    await db.update(sessions).set({ revealed: true }).where(eq(sessions.id, s.id));
  } else if (action === "next") {
    const nextIdx = curIdx + 1;
    if (nextIdx >= total) {
      await db
        .update(sessions)
        .set({ status: "ended", revealed: true, endedAt: new Date() })
        .where(eq(sessions.id, s.id));
    } else {
      await db
        .update(sessions)
        .set({
          status: "active",
          currentQuestionId: qrows[nextIdx].id,
          questionStartedAt: new Date(),
          revealed: false,
        })
        .where(eq(sessions.id, s.id));
    }
  } else if (action === "end") {
    await db
      .update(sessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(sessions.id, s.id));
  } else {
    throw new HttpError(422, "bad_action", "Unknown action");
  }

  await publishState(s.id);
  return { ok: true as const };
}
