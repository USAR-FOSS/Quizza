import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  answers,
  options,
  participants,
  questions,
  quizzes,
  sessions,
} from "@/lib/db/schema";
import { publish } from "./bus";
import { usesRedisRealtime } from "@/lib/redis/client";
import { canRevealAnswers, canShowLeaderboard } from "@/lib/quiz-policy";
import { seededShuffle } from "@/lib/shuffle";
import { enabledPowerups, powerupUses } from "@/lib/powerups";
import { settleDueQuestion } from "./settlement";
import type { QuizSettings } from "@/lib/db/schema-types";
import type {
  HostSnapshot,
  LiveLeaderboardEntry,
  LivePhase,
  PlayerSnapshot,
  RevealTally,
} from "./events";

const clockGlobal = globalThis as typeof globalThis & {
  quizzaClocks?: Map<
    string,
    { deadline: number; timer: ReturnType<typeof setTimeout> }
  >;
};
const clocks = (clockGlobal.quizzaClocks ??= new Map());

function armReveal(sessionId: string, deadline: number) {
  if (clocks.get(sessionId)?.deadline === deadline) return;
  const old = clocks.get(sessionId);
  if (old) clearTimeout(old.timer);
  const timer = setTimeout(
    () => {
      clocks.delete(sessionId);
      void publishState(sessionId).catch((error) => {
        console.error("Live reveal failed; retrying", error);
        armReveal(sessionId, Date.now() + 1000);
      });
    },
    Math.max(0, deadline - Date.now()),
  );
  timer.unref?.();
  clocks.set(sessionId, { deadline, timer });
}

/** Builds the player and host snapshots for a session's current state. */
export async function buildSnapshots(
  sessionId: string,
): Promise<{ player: PlayerSnapshot; host: HostSnapshot }> {
  const [s] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!s) {
    const empty: PlayerSnapshot = {
      phase: "ended",
      quiz: { title: "", theme: "grape" },
      participantCount: 0,
      question: null,
      reveal: null,
      leaderboard: [],
    };
    return {
      player: empty,
      host: { ...empty, answeredCount: 0, correctOptionId: null },
    };
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
  const qs = settings.shuffleQuestions
    ? seededShuffle(quiz?.questions ?? [], `live:${s.id}`)
    : (quiz?.questions ?? []);

  // Persist the shared reveal. Reconnecting after a restart also catches up.
  const timedQuestion = qs.find((q) => q.id === s.currentQuestionId);
  if (
    s.mode === "live" &&
    s.status === "active" &&
    !s.revealed &&
    timedQuestion &&
    s.questionStartedAt &&
    (!usesRedisRealtime() || !process.env.QSTASH_TOKEN)
  ) {
    const deadline =
      s.questionStartedAt.getTime() + timedQuestion.timeLimitSec * 1000;
    if (Date.now() >= deadline) {
      const result = await settleDueQuestion({
        sessionId: s.id,
        questionId: timedQuestion.id,
        questionStartedAt: s.questionStartedAt.toISOString(),
      });
      if (result.status !== "early") return buildSnapshots(sessionId);
      armReveal(s.id, Date.now() + result.retryAfter * 1000);
    } else armReveal(s.id, deadline);
  } else {
    const old = clocks.get(s.id);
    if (old) clearTimeout(old.timer);
    clocks.delete(s.id);
  }

  const parts = await db
    .select()
    .from(participants)
    .where(eq(participants.sessionId, sessionId))
    .orderBy(desc(participants.score), asc(participants.joinedAt));

  const leaderboard: LiveLeaderboardEntry[] = parts.map((p, i) => ({
    participantId: p.id,
    nickname: p.nickname,
    avatarColor: p.avatarColor,
    avatarUrl: p.avatarUrl,
    score: p.score,
    rank: i + 1,
  }));

  let phase: LivePhase;
  if (s.status === "ended") phase = "ended";
  else if (s.status === "lobby" || !s.currentQuestionId) phase = "lobby";
  else phase = s.revealed ? "reveal" : "question";

  const current = s.currentQuestionId
    ? (qs.find((q) => q.id === s.currentQuestionId) ?? null)
    : null;
  const currentIndex = current ? qs.findIndex((q) => q.id === current.id) : -1;

  let question: PlayerSnapshot["question"] = null;
  let correctOptionId: string | null = null;
  let tallies: RevealTally[] = [];
  let totalAnswers = 0;
  let answeredCount = 0;
  let textValues: string[] = [];
  let numberAverage: number | null = null;

  if (current && (phase === "question" || phase === "reveal")) {
    // option order shuffled once per session+question (same for all players)
    const displayOptions = settings.shuffleOptions
      ? seededShuffle(current.options, `o:${sessionId}:${current.id}`)
      : current.options;
    question = {
      id: current.id,
      type: current.type,
      prompt: current.prompt,
      mediaUrl: current.mediaUrl,
      settings: current.settings,
      timeLimitSec: current.timeLimitSec,
      startedAt: s.questionStartedAt ? s.questionStartedAt.toISOString() : null,
      index: currentIndex,
      total: qs.length,
      options: displayOptions.map((o) => ({
        id: o.id,
        label: o.label,
        color: o.color,
      })),
    };
    correctOptionId = current.options.find((o) => o.isCorrect)?.id ?? null;

    const ans = await db
      .select()
      .from(answers)
      .where(
        and(
          eq(answers.sessionId, sessionId),
          eq(answers.questionId, current.id),
        ),
      );
    answeredCount = ans.length;
    textValues = ans.flatMap((a) => (a.textValue ? [a.textValue] : []));
    const numbers = ans.flatMap((a) =>
      a.numberValue == null ? [] : [a.numberValue],
    );
    numberAverage = numbers.length
      ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length
      : null;
    totalAnswers = ans.length;
    const counts = new Map<string, number>();
    for (const a of ans)
      if (a.optionId) counts.set(a.optionId, (counts.get(a.optionId) ?? 0) + 1);
    tallies = current.options.map((o) => ({
      optionId: o.id,
      count: counts.get(o.id) ?? 0,
    }));
  }

  // policy gating for the player view (the host always sees everything)
  const over = phase === "ended";
  const playerSeesAnswers = canRevealAnswers(settings, over);
  const playerSeesBoard = canShowLeaderboard(settings, over);

  let playerLeaderboard: LiveLeaderboardEntry[] = [];
  if (phase === "lobby")
    playerLeaderboard = leaderboard; // the lobby roster
  else if (phase === "reveal" || phase === "ended") {
    playerLeaderboard = playerSeesBoard ? leaderboard : [];
  }

  const player: PlayerSnapshot = {
    serverNow: Date.now(),
    phase,
    quiz: {
      title: quiz?.title ?? "",
      theme: quiz?.theme ?? "grape",
      powerups: Boolean(settings.powerups),
      powerupUses: powerupUses(settings),
      powerupTypes: enabledPowerups(settings, s.mode),
      coverImage: settings.coverImage,
      iconImage: settings.iconImage,
      coverIcon: quiz?.coverIcon,
    },
    participantCount: parts.length,
    question,
    reveal:
      phase === "reveal"
        ? {
            correctOptionId: playerSeesAnswers ? correctOptionId : null,
            tallies,
            totalAnswers,
            textValues,
            numberAverage,
          }
        : null,
    leaderboard: playerLeaderboard,
  };

  const host: HostSnapshot = {
    ...player,
    leaderboard, // host always sees standings
    answeredCount,
    correctOptionId,
  };

  return { player, host };
}

/** Rebuilds and broadcasts the state to everyone in the session. */
const broadcasts = new Map<string, Promise<void>>();
export async function publishState(sessionId: string): Promise<void> {
  const next = (broadcasts.get(sessionId) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const { player, host } = await buildSnapshots(sessionId);
      await publish(sessionId, { kind: "state", player, host });
    });
  broadcasts.set(sessionId, next);
  try {
    await next;
  } finally {
    if (broadcasts.get(sessionId) === next) broadcasts.delete(sessionId);
  }
}
