import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  answers,
  options,
  participants,
  questions,
  quizzes,
  sessions,
  questionViews,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/api/http";
import {
  resetAnswerCounter,
  scheduleRoster,
  scheduleAnswerCount,
} from "@/lib/realtime/notifications";
import { publishState } from "@/lib/realtime/snapshot";
import { scheduleReveal } from "@/lib/realtime/scheduler";
import { settleDueQuestion } from "@/lib/realtime/settlement";
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
import { csvField } from "@/lib/csv";
import { applyPowerup, enabledPowerups, powerupUses } from "@/lib/powerups";
import { matchingTeamName, normalizeTeamNames, normalizeTeamRoster, rosterTeamForEmail } from "@/lib/teams";
import { getCurrentUser, oidcEnabled } from "@/lib/auth";
import type { z } from "zod";
import type { QuizSettings } from "@/lib/db/schema-types";
import type {
  CreateSessionBody,
  JoinBody,
  SubmitAnswerBody,
} from "@/lib/api/schemas";

type SessionRow = typeof sessions.$inferSelect;

/** Context the API routes gather from the request for the lib functions. */
export type JoinContext = { userId: string | null; deviceId: string | null; oidcSubject?: string | null };
export type ResultsContext = {
  hostToken: string | null;
  clientToken: string | null;
};

/** Whether a session has fully finished (window closed, or live ended). */
function isSessionOver(s: SessionRow): boolean {
  if (s.status === "ended") return true;
  if (s.mode === "scheduled" && s.closesAt)
    return Date.now() > s.closesAt.getTime();
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
  if (quiz?.settings.teamSelection && !normalizeTeamNames(quiz.settings.teamNames ?? []).length)
    problems.push("Add at least one team name or turn off team selection.");
  if (quiz?.settings.teamEmailVerification) {
    if (!quiz.settings.teamSelection) problems.push("Turn on team selection to verify team emails.");
    if (participationMode(quiz.settings) !== "signed_in") problems.push("Email-verified teams require signed-in participation.");
    if (!oidcEnabled()) problems.push("Configure FOSSClub sign-in before launching an email-rostered quiz.");
    try {
      const teamNames = normalizeTeamNames(quiz.settings.teamNames ?? []);
      const roster = normalizeTeamRoster(quiz.settings.teamRoster ?? [], teamNames);
      const rosteredTeams = new Set(roster.map((member) => member.teamName));
      if (teamNames.some((name) => !rosteredTeams.has(name)))
        problems.push("Add at least one rostered email for every team.");
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "Check the team email roster.");
    }
  }

  qs.forEach((q, i) => {
    const n = i + 1;
    const meta = QUESTION_TYPES[q.type];
    if (!q.prompt.trim()) problems.push(`Question ${n} has no prompt.`);
    if (meta.hasOptions) {
      if (q.options.some((o) => !o.label.trim()))
        problems.push(
          `Question ${n}: fill or remove every empty answer option.`,
        );
      const filled = q.options.filter((o) => o.label.trim());
      if (filled.length < 2)
        problems.push(`Question ${n} needs at least two options.`);
      if (meta.scorable) {
        const correct = q.options.filter((o) => o.isCorrect).length;
        if (correct !== 1) {
          problems.push(
            `Question ${n} must have exactly one correct answer marked.`,
          );
        }
      }
    }
    if (
      q.type === "scale" &&
      (q.settings.scaleMin ?? 1) >= (q.settings.scaleMax ?? 5)
    )
      problems.push(
        `Question ${n}: the scale maximum must exceed its minimum.`,
      );
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
export async function getParticipantByToken(
  sessionId: string,
  clientToken: string,
) {
  return getParticipant(sessionId, clientToken);
}

export async function getProgress(code: string, token: string | null) {
  const s = await requireSession(code);
  const participant = token ? await getParticipant(s.id, token) : null;
  if (!participant)
    throw new HttpError(401, "invalid_token", "Unknown participant");
  const [rows, settings, incoming] = await Promise.all([
    db
      .select({
        questionId: answers.questionId,
        isCorrect: answers.isCorrect,
        points: answers.points,
        powerup: answers.powerup,
        attackStolen: answers.attackStolen,
        attackBlocked: answers.attackBlocked,
      })
      .from(answers)
      .where(
        and(
          eq(answers.sessionId, s.id),
          eq(answers.participantId, participant.id),
        ),
      ),
    sessionSettings(s),
    db
      .select({
        questionId: answers.questionId,
        attackStolen: answers.attackStolen,
      })
      .from(answers)
      .where(
        and(
          eq(answers.sessionId, s.id),
          eq(answers.powerupTargetId, participant.id),
        ),
      ),
  ]);
  const lossByQuestion = new Map<string, number>();
  for (const attack of incoming)
    lossByQuestion.set(attack.questionId, (lossByQuestion.get(attack.questionId) ?? 0) + attack.attackStolen);
  const visible = canRevealAnswers(settings, s.status === "ended");
  const results: Record<
    string,
    {
      accepted: true;
      revealed: boolean;
      isCorrect: boolean | null;
      pointsAwarded: number | null;
      correctOptionId: string | null;
      attackStolen: number;
      attackBlocked: boolean;
      attackedLoss: number;
    }
  > = {};
  for (const a of rows) {
    if (
      s.mode === "live" &&
      s.status !== "ended" &&
      (!s.revealed || a.questionId !== s.currentQuestionId)
    )
      continue;
    results[a.questionId] = {
      accepted: true,
      revealed: visible,
      isCorrect: visible ? a.isCorrect : null,
      pointsAwarded: visible ? a.points : null,
      correctOptionId: null,
      attackStolen: visible ? a.attackStolen : 0,
      attackBlocked: visible ? a.attackBlocked : false,
      attackedLoss: visible ? (lossByQuestion.get(a.questionId) ?? 0) : 0,
    };
  }
  return {
    answered: rows.map((a) => a.questionId),
    usedPowerups: rows.flatMap((a) => (a.powerup ? [a.powerup] : [])),
    results,
  };
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
  // A saved player token is not a substitute for the signed-in account. In
  // particular, logging out or switching accounts must not resume that attempt.
  if (p?.userId && (await getCurrentUser())?.id !== p.userId)
    throw new HttpError(401, "signin_required", "Sign in with the account that joined this quiz");
  return p;
}

/**
 * Detects a Postgres unique-violation (SQLSTATE 23505). Drizzle wraps the driver
 * error, so the real code can sit on the error or on its `cause`.
 */
function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++) {
    if (
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "23505"
    ) {
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
  if (quiz.ownerId !== ownerUserId) {
    throw new HttpError(403, "forbidden", "You do not own this quiz");
  }

  const problems = await validateQuizForLaunch(input.quizId);
  if (problems.length) {
    throw new HttpError(
      422,
      "quiz_invalid",
      "This quiz is not ready to launch",
      problems,
    );
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
      throw new HttpError(
        422,
        "validation_error",
        "opensAt and closesAt must be valid datetimes",
      );
    }
    if (closesAt <= opensAt) {
      throw new HttpError(
        422,
        "validation_error",
        "closesAt must be after opensAt",
      );
    }
    if (closesAt.getTime() <= Date.now())
      throw new HttpError(
        422,
        "validation_error",
        "The closing time must be in the future",
      );
    status = "active"; // openness is gated by the window, not the status
  }

  const hostToken = generateToken();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateJoinCode();
    try {
      const [s] = await db
        .insert(sessions)
        .values({
          quizId: input.quizId,
          mode: input.mode,
          status,
          hostToken,
          code,
          opensAt,
          closesAt,
        })
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
  throw new HttpError(
    500,
    "code_generation_failed",
    "Could not allocate a unique join code",
  );
}

/* --------------------------- public info ---------------------------- */

export async function getPublicSession(code: string) {
  const s = await requireSession(code);
  const [quiz, teamCounts] = await Promise.all([
    db.query.quizzes.findFirst({
      where: eq(quizzes.id, s.quizId),
      columns: { title: true, coverIcon: true, theme: true, settings: true },
    }),
    db
      .select({ teamName: participants.teamName, count: sql<number>`count(*)::int` })
      .from(participants)
      .where(eq(participants.sessionId, s.id))
      .groupBy(participants.teamName),
  ]);
  const count = teamCounts.reduce((total, row) => total + row.count, 0);
  const settings = (quiz?.settings as QuizSettings) ?? {};
  const teams = settings.teamSelection ? normalizeTeamNames(settings.teamNames ?? []).map((name) => ({
    name,
    joined: teamCounts.find((row) => row.teamName === name)?.count ?? 0,
  })) : [];

  return {
    id: s.id,
    code: s.code,
    mode: s.mode,
    status: s.status,
    opensAt: iso(s.opensAt),
    closesAt: iso(s.closesAt),
    participantCount: count,
    participation: participationMode(settings),
    teams,
    teamSize: settings.teamSelection ? settings.teamSize ?? 1 : null,
    teamEmailVerification: Boolean(settings.teamSelection && settings.teamEmailVerification),
    powerups: Boolean(quiz?.settings.powerups),
    powerupUses: powerupUses(quiz?.settings),
    powerupTypes: enabledPowerups(quiz?.settings, s.mode),
    quiz: {
      title: quiz?.title ?? "",
      coverIcon: quiz?.coverIcon ?? "shapes",
      theme: quiz?.theme ?? "grape",
      coverImage: quiz?.settings.coverImage,
      iconImage: quiz?.settings.iconImage,
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
    throw new HttpError(
      409,
      "session_not_open",
      "This session is not open right now",
    );
  }
  if (!isClean(input.nickname)) {
    throw new HttpError(
      422,
      "nickname_rejected",
      "Please choose a different nickname",
    );
  }

  const settings = await sessionSettings(s);
  const mode = participationMode(settings);

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

  const teamName = settings.teamSelection
    ? matchingTeamName(settings.teamNames ?? [], input.teamName ?? "")
    : null;
  if (settings.teamSelection && !teamName)
    throw new HttpError(422, "team_required", "Choose a team from the list");
  if (settings.teamEmailVerification) {
    if (mode !== "signed_in" || !userId || !ctx.oidcSubject)
      throw new HttpError(401, "oidc_required", "Sign in with FOSSClub to join this quiz");
    if (!input.email || rosterTeamForEmail(settings.teamRoster ?? [], input.email)?.toLowerCase() !== teamName?.toLowerCase())
      throw new HttpError(422, "team_email_mismatch", "That email is not listed for this team. Check and retry.");
  }
  const rosterEmail = settings.teamEmailVerification ? input.email!.trim().toLowerCase() : null;

  if (
    s.mode === "live" &&
    s.status === "active" &&
    settings.allowLateJoin === false
  ) {
    throw new HttpError(
      409,
      "late_join_disabled",
      "The host has closed joining for this quiz",
    );
  }

  const clientToken = generateToken();
  const avatarColor = input.avatarColor ?? colorFor(input.nickname);
  try {
    const values = { sessionId: s.id, nickname: input.nickname, teamName, rosterEmail, avatarColor, clientToken, userId, deviceId };
    const p = teamName ? await db.transaction(async (tx) => {
      // Serializes joins for this room, including joins handled by other instances.
      await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, s.id)).for("update");
      const identity = userId ? eq(participants.userId, userId)
        : deviceId ? eq(participants.deviceId, deviceId) : null;
      if (identity) {
        const [existing] = await tx.select().from(participants)
          .where(and(eq(participants.sessionId, s.id), identity)).limit(1);
        if (existing) return existing;
      }
      if (rosterEmail) {
        const [claimed] = await tx.select({ id: participants.id }).from(participants)
          .where(and(eq(participants.sessionId, s.id), eq(participants.rosterEmail, rosterEmail))).limit(1);
        if (claimed) throw new HttpError(409, "team_email_used", "That email has already been used for this quiz.");
      }
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(participants)
        .where(and(eq(participants.sessionId, s.id), eq(participants.teamName, teamName)));
      if (count >= (settings.teamSize ?? 1))
        throw new HttpError(409, "team_full", `${teamName} has already used all ${settings.teamSize ?? 1} allowed ${settings.teamSize === 1 || !settings.teamSize ? "attempt" : "attempts"} for this quiz.`);
      const [joined] = await tx.insert(participants).values(values).returning();
      return joined;
    }) : (await db.insert(participants).values(values).returning())[0];
    if (s.mode === "live") scheduleRoster(s.id, p.id, true);
    return participantView(p);
  } catch (err) {
    // lost a race on the per-user/per-device unique index: return the winner
    if (isUniqueViolation(err) && (userId || deviceId)) {
      const existing = await findExistingParticipant(s.id, userId, deviceId);
      if (existing) return participantView(existing);
    }
    if (isUniqueViolation(err) && rosterEmail)
      throw new HttpError(409, "team_email_used", "That email has already been used for this quiz.");
    throw err;
  }
}

function participantView(p: typeof participants.$inferSelect) {
  return {
    id: p.id,
    nickname: p.nickname,
    teamName: p.teamName,
    avatarColor: p.avatarColor,
    avatarUrl: p.avatarUrl,
    clientToken: p.clientToken,
  };
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
      .where(
        and(
          eq(participants.sessionId, sessionId),
          eq(participants.userId, userId),
        ),
      )
      .limit(1);
    if (p) return p;
  }
  if (deviceId) {
    const [p] = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.sessionId, sessionId),
          eq(participants.deviceId, deviceId),
        ),
      )
      .limit(1);
    if (p) return p;
  }
  return undefined;
}

/* --------------------------- questions ------------------------------ */

export async function listQuestions(code: string, clientToken: string | null) {
  const s = await requireSession(code);
  if (s.mode !== "scheduled") {
    throw new HttpError(
      409,
      "not_scheduled",
      "This endpoint is for scheduled sessions",
    );
  }
  if (!scheduledOpen(s)) {
    throw new HttpError(
      409,
      "session_not_open",
      "This session is not open right now",
    );
  }
  if (!clientToken) {
    throw new HttpError(
      401,
      "missing_token",
      "A participant client token is required",
    );
  }
  const participant = await getParticipant(s.id, clientToken);
  if (!participant) {
    throw new HttpError(401, "invalid_token", "Unknown participant");
  }

  const [quiz, answered, views] = await Promise.all([
    db.query.quizzes.findFirst({
      where: eq(quizzes.id, s.quizId),
      with: {
        questions: {
          orderBy: asc(questions.position),
          with: { options: { orderBy: asc(options.position) } },
        },
      },
    }),
    db
      .select({ questionId: answers.questionId, powerup: answers.powerup })
      .from(answers)
      .where(
        and(
          eq(answers.sessionId, s.id),
          eq(answers.participantId, participant.id),
        ),
      ),
    db
      .select({ questionId: questionViews.questionId, startedAt: questionViews.startedAt })
      .from(questionViews)
      .where(eq(questionViews.participantId, participant.id)),
  ]);

  const settings = (quiz?.settings as QuizSettings) ?? {};
  let qlist = quiz?.questions ?? [];
  // deterministic per-participant shuffle, so order is stable across reloads
  if (settings.shuffleQuestions)
    qlist = seededShuffle(qlist, `q:${participant.id}`);
  const expired = views
    .filter((v) => {
      const q = qlist.find((q) => q.id === v.questionId);
      return q && Date.now() > v.startedAt.getTime() + q.timeLimitSec * 1000;
    })
    .map((v) => v.questionId);
  return {
    answered: [...new Set([...answered.map((a) => a.questionId), ...expired])],
    usedPowerups: answered.flatMap((a) => (a.powerup ? [a.powerup] : [])),
    questions: qlist.map((q) => {
      const opts = settings.shuffleOptions
        ? seededShuffle(q.options, `o:${participant.id}:${q.id}`)
        : q.options;
      return {
        id: q.id,
        position: q.position,
        type: q.type,
        prompt: q.prompt,
        mediaUrl: q.mediaUrl,
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
  if (s.mode !== "scheduled" || s.status === "ended" || !scheduledOpen(s)) {
    throw new HttpError(
      409,
      "session_not_open",
      "This scheduled session is not open",
    );
  }
  if (!clientToken)
    throw new HttpError(401, "missing_token", "A client token is required");
  const participant = await getParticipant(s.id, clientToken);
  if (!participant)
    throw new HttpError(401, "invalid_token", "Unknown participant");
  const q = await db.query.questions.findFirst({
    where: and(eq(questions.id, questionId), eq(questions.quizId, s.quizId)),
    columns: { id: true },
  });
  if (!q) throw new HttpError(404, "question_not_found", "Question not found");
  const [inserted] = await db
    .insert(questionViews)
    .values({ participantId: participant.id, questionId: q.id })
    .onConflictDoNothing()
    .returning({ startedAt: questionViews.startedAt });
  const view =
    inserted ??
    (await db
      .select({ startedAt: questionViews.startedAt })
      .from(questionViews)
      .where(
        and(
          eq(questionViews.participantId, participant.id),
          eq(questionViews.questionId, q.id),
        ),
      )
      .limit(1)
      .then(([v]) => v));
  return {
    viewToken: signViewToken(
      s.id,
      q.id,
      participant.id,
      view.startedAt.getTime(),
    ),
    startedAt: view.startedAt.toISOString(),
  };
}

/* ---------------------------- submit -------------------------------- */

export async function submitAnswer(
  code: string,
  input: z.infer<typeof SubmitAnswerBody>,
) {
  const s = await requireSession(code);
  const [participant, q, settings] = await Promise.all([
    getParticipant(s.id, input.clientToken),
    db.query.questions.findFirst({
      where: and(
        eq(questions.id, input.questionId),
        eq(questions.quizId, s.quizId),
      ),
      with: { options: true },
    }),
    sessionSettings(s),
  ]);
  if (!participant) {
    throw new HttpError(404, "participant_not_found", "Unknown participant");
  }
  if (!q)
    throw new HttpError(
      404,
      "question_not_found",
      "Question not found in this quiz",
    );

  // is the session accepting answers for this question right now
  if (s.mode === "scheduled") {
    if (s.status === "ended" || !scheduledOpen(s)) {
      throw new HttpError(
        409,
        "session_not_open",
        "This session is not open right now",
      );
    }
  } else {
    if (s.status !== "active" || s.currentQuestionId !== q.id || s.revealed) {
      throw new HttpError(
        409,
        "not_current_question",
        "That question is not live",
      );
    }
  }

  const meta = QUESTION_TYPES[q.type];
  if (input.powerup && (!meta.scorable || !enabledPowerups(settings, s.mode).includes(input.powerup))) {
    throw new HttpError(
      422,
      "powerup_unavailable",
      "Powerups are not enabled for this question",
    );
  }
  if ((input.powerup === "attack") !== Boolean(input.powerupTargetId)) {
    throw new HttpError(422, "attack_target_required", "Choose one player to attack");
  }
  if (input.powerupTargetId === participant.id) {
    throw new HttpError(422, "invalid_attack_target", "Choose another player");
  }
  let optionId: string | null = null;
  let textValue: string | null = null;
  let numberValue: number | null = null;
  let isCorrect = false;
  let correctOptionId: string | null = null;

  if (meta.hasOptions) {
    if (!input.optionId) {
      throw new HttpError(
        422,
        "missing_option",
        "This question needs an optionId",
      );
    }
    const opt = q.options.find((o) => o.id === input.optionId);
    if (!opt)
      throw new HttpError(
        422,
        "invalid_option",
        "That option is not part of this question",
      );
    optionId = opt.id;
    if (meta.scorable) {
      isCorrect = opt.isCorrect;
      correctOptionId = q.options.find((o) => o.isCorrect)?.id ?? null;
    }
  } else if (q.type === "scale") {
    if (input.numberValue == null) {
      throw new HttpError(
        422,
        "missing_number",
        "This question needs a numberValue",
      );
    }
    numberValue = input.numberValue;
    if (
      numberValue < (q.settings.scaleMin ?? 1) ||
      numberValue > (q.settings.scaleMax ?? 5)
    ) {
      throw new HttpError(
        422,
        "invalid_number",
        "Choose a value within the question's scale",
      );
    }
  } else {
    // word_cloud or open_text
    const text = input.textValue?.trim();
    if (!text)
      throw new HttpError(
        422,
        "missing_text",
        "This question needs a textValue",
      );
    if (!isClean(text))
      throw new HttpError(422, "text_rejected", "Please rephrase your answer");
    if (
      q.type === "word_cloud" &&
      text.split(/[,\n]/).filter((word) => word.trim()).length >
        (q.settings.maxWords ?? 1)
    ) {
      throw new HttpError(
        422,
        "too_many_entries",
        `Submit up to ${q.settings.maxWords ?? 1} word-cloud entries, separated by commas`,
      );
    }
    textValue = text;
  }

  let responseMs: number | null = null;
  if (s.mode === "scheduled") {
    const issuedAt = input.viewToken
      ? verifyViewToken(input.viewToken, s.id, q.id, participant.id)
      : null;
    const [view] = await db
      .select()
      .from(questionViews)
      .where(
        and(
          eq(questionViews.participantId, participant.id),
          eq(questionViews.questionId, q.id),
        ),
      );
    if (issuedAt == null || !view || issuedAt !== view.startedAt.getTime()) {
      throw new HttpError(
        422,
        "invalid_view_token",
        "Open the question before answering",
      );
    }
    responseMs = Date.now() - issuedAt;
  } else if (s.questionStartedAt) {
    responseMs = Date.now() - s.questionStartedAt.getTime();
  }
  if (responseMs == null || responseMs > q.timeLimitSec * 1000 + 1000) {
    throw new HttpError(
      409,
      "question_expired",
      "Time is up for this question",
    );
  }
  responseMs = clampResponseMs(responseMs, q.timeLimitSec);

  const baseScore = computePoints({
    scorable: meta.scorable,
    isCorrect,
    basePoints: q.points,
    timeLimitSec: q.timeLimitSec,
    responseMs,
    speedBonus: q.settings?.speedBonus ?? settings.speedBonus ?? false,
  });
  const points = applyPowerup(baseScore, q.points, isCorrect, input.powerup);

  try {
    await db.transaction(async (tx) => {
      if (s.mode === "live") {
        const [current] = await tx
          .select()
          .from(sessions)
          .where(eq(sessions.id, s.id))
          // Concurrent players share this lock; a reveal/advance waits for them.
          .for("share");
        if (
          current.status !== "active" ||
          current.revealed ||
          current.currentQuestionId !== q.id ||
          !current.questionStartedAt ||
          Date.now() >=
            current.questionStartedAt.getTime() + q.timeLimitSec * 1000
        ) {
          throw new HttpError(
            409,
            "question_expired",
            "Time is up. The room is revealing this round.",
          );
        }
      }
      if (input.powerup) {
        // Serialize answers by this player across questions so charges cannot
        // be overspent by concurrent requests on different app instances.
        await tx.select({ id: participants.id }).from(participants)
          .where(eq(participants.id, participant.id)).for("update");
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(answers).where(and(
            eq(answers.participantId, participant.id),
            isNotNull(answers.powerup),
          ));
        if (count >= powerupUses(settings))
          throw new HttpError(409, "powerup_used", "No powerups left");
        if (input.powerupTargetId) {
          const [target] = await tx.select({ id: participants.id }).from(participants)
            .where(and(
              eq(participants.id, input.powerupTargetId),
              eq(participants.sessionId, s.id),
            ));
          if (!target)
            throw new HttpError(422, "invalid_attack_target", "That player is not in this room");
        }
      }
      await tx.insert(answers).values({
        sessionId: s.id,
        questionId: q.id,
        participantId: participant.id,
        optionId,
        textValue,
        numberValue,
        isCorrect,
        responseMs,
        points,
        powerup: input.powerup,
        powerupTargetId: input.powerupTargetId,
      });
      if (points > 0)
        await tx
          .update(participants)
          .set({ score: sql`${participants.score} + ${points}` })
          .where(eq(participants.id, participant.id));
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(
        409,
        "already_answered",
        "You have already answered this question",
      );
    }
    throw err;
  }

  // live: tell the host how many have answered this question (host connection only)
  if (s.mode === "live") {
    scheduleAnswerCount(s.id, q.id);
  }

  // reveal gating: only return correctness when the quiz reveals it per-question.
  // Otherwise the answer is recorded silently (shown later per policy).
  const reveal =
    s.mode === "scheduled" && revealPolicy(settings) === "per_question";
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
  let participantFinished = false;
  if (s.mode === "scheduled" && !over && ctx.clientToken) {
    const player = await getParticipant(s.id, ctx.clientToken);
    if (player && quiz?.questions.length) {
      const [playerAnswers, views] = await Promise.all([
        db.select({ questionId: answers.questionId }).from(answers)
          .where(eq(answers.participantId, player.id)),
        db.select({ questionId: questionViews.questionId, startedAt: questionViews.startedAt })
          .from(questionViews).where(eq(questionViews.participantId, player.id)),
      ]);
      const completed = new Set(playerAnswers.map((answer) => answer.questionId));
      for (const view of views) {
        const question = quiz.questions.find((item) => item.id === view.questionId);
        if (question && Date.now() >= view.startedAt.getTime() + question.timeLimitSec * 1000)
          completed.add(view.questionId);
      }
      participantFinished = quiz.questions.every((question) => completed.has(question.id));
    }
  }
  const playerEnd = over || participantFinished;
  const showAnswers = isHost || canRevealAnswers(settings, playerEnd);
  const showBoard = isHost ||
    ((playerEnd || (s.mode === "live" && s.revealed)) &&
      canShowLeaderboard(settings, playerEnd));

  const needStats = isHost || playerEnd;

  const [parts, allAnswers] = await Promise.all([
    db
      .select({
        id: participants.id,
        nickname: participants.nickname,
        teamName: participants.teamName,
        avatarColor: participants.avatarColor,
        avatarUrl: participants.avatarUrl,
        score: participants.score,
      })
      .from(participants)
      .where(eq(participants.sessionId, s.id))
      .orderBy(desc(participants.score), asc(participants.joinedAt)),
    needStats
      ? db
          .select({
            questionId: answers.questionId,
            optionId: answers.optionId,
            textValue: answers.textValue,
            numberValue: answers.numberValue,
          })
          .from(answers)
          .where(eq(answers.sessionId, s.id))
      : Promise.resolve([]),
  ]);

  const leaderboard = showBoard
    ? parts.map((p, i) => ({
        participantId: p.id,
        nickname: p.nickname,
        teamName: p.teamName,
        avatarColor: p.avatarColor,
        avatarUrl: p.avatarUrl,
        score: p.score,
        rank: i + 1,
      }))
    : [];

  const byQuestion = new Map<string, typeof allAnswers>();
  for (const a of allAnswers) {
    const list = byQuestion.get(a.questionId) ?? [];
    list.push(a);
    byQuestion.set(a.questionId, list);
  }

  const questionStats = (!isHost && !playerEnd ? [] : (quiz?.questions ?? [])).map(
    (q) => {
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
        numbers.length > 0
          ? numbers.reduce((s, n) => s + n, 0) / numbers.length
          : null;

      return {
        questionId: q.id,
        prompt: q.prompt,
        mediaUrl: q.mediaUrl,
        type: q.type,
        responses: list.length,
        options: optionTallies,
        textValues,
        numberAverage,
      };
    },
  );

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

/** Host-only CSV of every answer. Throws 403 without the host token. */
export async function exportCsv(
  code: string,
  hostToken: string | null,
): Promise<string> {
  const s = await requireSession(code);
  if (!hostToken || hostToken !== s.hostToken) {
    throw new HttpError(403, "forbidden", "Host token required");
  }

  const [quiz, parts, allAnswers] = await Promise.all([
    db.query.quizzes.findFirst({
      where: eq(quizzes.id, s.quizId),
      with: {
        questions: { orderBy: asc(questions.position), with: { options: true } },
      },
    }),
    db
      .select({
        id: participants.id,
        nickname: participants.nickname,
        teamName: participants.teamName,
        score: participants.score,
      })
      .from(participants)
      .where(eq(participants.sessionId, s.id)),
    db
      .select({
        participantId: answers.participantId,
        questionId: answers.questionId,
        optionId: answers.optionId,
        textValue: answers.textValue,
        numberValue: answers.numberValue,
        isCorrect: answers.isCorrect,
        responseMs: answers.responseMs,
        points: answers.points,
      })
      .from(answers)
      .where(eq(answers.sessionId, s.id)),
  ]);

  const partById = new Map(parts.map((p) => [p.id, p]));
  const qById = new Map((quiz?.questions ?? []).map((q) => [q.id, q]));

  const header = [
    "nickname",
    "team",
    "score",
    "question",
    "answer",
    "correct",
    "response_ms",
    "points",
  ];
  const rows = [header.map(csvField).join(",")];

  for (const a of allAnswers) {
    const p = partById.get(a.participantId);
    const q = qById.get(a.questionId);
    const answerText =
      a.optionId != null
        ? (q?.options.find((o) => o.id === a.optionId)?.label ?? "")
        : (a.textValue ?? (a.numberValue != null ? String(a.numberValue) : ""));
    rows.push(
      [
        csvField(p?.nickname),
        csvField(p?.teamName),
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
    throw new HttpError(
      409,
      "not_live",
      "Only live sessions can be controlled",
    );
  }
  if (s.status === "ended")
    throw new HttpError(409, "session_ended", "This session has ended");
  if (action === "start" && s.status !== "lobby")
    throw new HttpError(
      409,
      "already_started",
      "This session has already started",
    );
  if ((action === "reveal" || action === "next") && s.status !== "active")
    throw new HttpError(409, "not_started", "Start the session first");
  if (action === "next" && !s.revealed)
    throw new HttpError(
      409,
      "not_revealed",
      "Wait for the shared reveal before the next round.",
    );
  if (action === "reveal" && !s.revealed) {
    const question = s.currentQuestionId
      ? await db.query.questions.findFirst({
          where: eq(questions.id, s.currentQuestionId),
        })
      : null;
    if (
      !question ||
      !s.questionStartedAt ||
      Date.now() < s.questionStartedAt.getTime() + question.timeLimitSec * 1000
    )
      throw new HttpError(
        409,
        "round_running",
        "Everyone gets the full timer. Answers reveal together when it ends.",
      );
  }
  if (action === "reveal") {
    if (!s.currentQuestionId || !s.questionStartedAt)
      throw new HttpError(409, "not_started", "Start the session first");
    const result = await settleDueQuestion({
      sessionId: s.id,
      questionId: s.currentQuestionId,
      questionStartedAt: s.questionStartedAt.toISOString(),
    });
    if (result.status === "early")
      throw new HttpError(409, "round_running", "Everyone gets the full timer.");
    if (result.status === "revealed") await publishState(s.id);
    return { ok: true as const };
  }

  let qrows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.quizId, s.quizId))
    .orderBy(asc(questions.position));
  const settings = await sessionSettings(s);
  if (settings.shuffleQuestions) qrows = seededShuffle(qrows, `live:${s.id}`);
  const total = qrows.length;
  const curIdx = s.currentQuestionId
    ? qrows.findIndex((q) => q.id === s.currentQuestionId)
    : -1;

  let patch: Partial<typeof sessions.$inferInsert>;
  let scheduledQuestion: {
    id: string;
    startedAt: Date;
    timeLimitSec: number;
  } | null = null;
  if (action === "start") {
    if (total === 0)
      throw new HttpError(409, "no_questions", "Add questions first");
    const startedAt = new Date();
    const question = await db.query.questions.findFirst({
      where: eq(questions.id, qrows[0].id),
      columns: { timeLimitSec: true },
    });
    if (!question)
      throw new HttpError(409, "no_questions", "Add questions first");
    scheduledQuestion = {
      id: qrows[0].id,
      startedAt,
      timeLimitSec: question.timeLimitSec,
    };
    patch = {
      status: "active",
      currentQuestionId: qrows[0].id,
      questionStartedAt: startedAt,
      revealed: false,
    };
  } else if (action === "next") {
    const nextIdx = curIdx + 1;
    if (nextIdx >= total) {
      patch = { status: "ended", revealed: true, endedAt: new Date() };
    } else {
      const startedAt = new Date();
      const question = await db.query.questions.findFirst({
        where: eq(questions.id, qrows[nextIdx].id),
        columns: { timeLimitSec: true },
      });
      if (!question)
        throw new HttpError(409, "no_questions", "Add questions first");
      scheduledQuestion = {
        id: qrows[nextIdx].id,
        startedAt,
        timeLimitSec: question.timeLimitSec,
      };
      patch = {
        status: "active",
        currentQuestionId: qrows[nextIdx].id,
        questionStartedAt: startedAt,
        revealed: false,
      };
    }
  } else if (action === "end") {
    patch = { status: "ended", endedAt: new Date() };
  } else {
    throw new HttpError(422, "bad_action", "Unknown action");
  }

  if (scheduledQuestion) {
    await scheduleReveal(
      {
        sessionId: s.id,
        questionId: scheduledQuestion.id,
        questionStartedAt: scheduledQuestion.startedAt.toISOString(),
      },
      scheduledQuestion.startedAt.getTime() +
        scheduledQuestion.timeLimitSec * 1000,
    );
  }

  // Seed the distributed host-only counter before the new round becomes
  // answerable. A failed conditional update leaves only a short-lived key.
  if (action === "start") await resetAnswerCounter(s.id, qrows[0].id);
  else if (action === "next" && curIdx + 1 < total)
    await resetAnswerCounter(s.id, qrows[curIdx + 1].id);

  const changed = await db
    .update(sessions)
    .set(patch)
    .where(
      and(
        eq(sessions.id, s.id),
        eq(sessions.status, s.status),
        eq(sessions.revealed, s.revealed),
        s.currentQuestionId
          ? eq(sessions.currentQuestionId, s.currentQuestionId)
          : isNull(sessions.currentQuestionId),
      ),
    )
    .returning({ id: sessions.id });
  if (!changed.length)
    throw new HttpError(
      409,
      "state_changed",
      "The room moved on. Try again from the current round.",
    );

  await publishState(s.id);
  return { ok: true as const };
}
