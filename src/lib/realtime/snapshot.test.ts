import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mock = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  quiz: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    query: { quizzes: { findFirst: mock.quiz } },
    select: () => {
      let table: string;
      const chain = {
        from: (value: Parameters<typeof getTableName>[0]) => {
          table = getTableName(value);
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve((mock.rows[table] ?? []).map((r) => ({ ...r }))).then(
            resolve,
          ),
      };
      return chain;
    },
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            Object.assign(mock.rows.sessions[0], patch);
            return [{ id: "room" }];
          },
        }),
      }),
    }),
  },
}));
vi.mock("./bus", () => ({ publish: mock.publish }));
import { buildSnapshots } from "./snapshot";

const quiz = {
  title: "Game",
  theme: "mint",
  settings: { leaderboard: "per_question" },
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      prompt: "Ready?",
      timeLimitSec: 5,
      settings: {},
      mediaUrl: null,
      options: [{ id: "yes", label: "Yes", isCorrect: true, color: "mint" }],
    },
  ],
};

describe("shared live reveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    const globals = globalThis as typeof globalThis & {
      quizzaClocks?: Map<string, unknown>;
    };
    globals.quizzaClocks?.clear();
    mock.publish.mockClear();
    mock.quiz.mockResolvedValue(quiz);
    mock.rows = {
      sessions: [
        {
          id: "room",
          quizId: "quiz",
          mode: "live",
          status: "active",
          revealed: false,
          currentQuestionId: "q1",
          questionStartedAt: new Date(),
        },
      ],
      participants: [
        {
          id: "p1",
          nickname: "Player",
          avatarColor: "mint",
          avatarUrl: "/photo",
          score: 100,
        },
      ],
      answers: [{ optionId: "yes", points: 100 }],
    };
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it("withholds player answers and standings while the clock is running", async () => {
    const snap = await buildSnapshots("room");
    expect(snap.player.phase).toBe("question");
    expect(snap.player.reveal).toBeNull();
    expect(snap.player.leaderboard).toEqual([]);
    expect(snap.host.correctOptionId).toBe("yes");
    expect(mock.publish).not.toHaveBeenCalled();
  });
  it("broadcasts one automatic reveal at the shared deadline", async () => {
    await buildSnapshots("room");
    await buildSnapshots("room"); // multiple SSE subscribers must not create extra clocks
    await vi.advanceTimersByTimeAsync(4999);
    expect(mock.publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mock.publish).toHaveBeenCalledTimes(1);
    expect(mock.publish.mock.calls[0][1].player).toMatchObject({
      phase: "reveal",
      reveal: { correctOptionId: "yes", totalAnswers: 1 },
    });
    expect(mock.rows.sessions[0].revealed).toBe(true);
  });
  it("catches up an expired round when the server or a player reconnects", async () => {
    mock.rows.sessions[0].questionStartedAt = new Date(Date.now() - 10_000);
    expect((await buildSnapshots("room")).player.phase).toBe("reveal");
    expect(mock.rows.sessions[0].revealed).toBe(true);
  });
  it("continues to honor never-reveal and hidden-board policies", async () => {
    mock.rows.sessions[0].revealed = true;
    mock.quiz.mockResolvedValue({
      ...quiz,
      settings: { revealAnswers: "never", leaderboard: "never" },
    });
    const { player, host } = await buildSnapshots("room");
    expect(player.reveal?.correctOptionId).toBeNull();
    expect(player.leaderboard).toEqual([]);
    expect(host.correctOptionId).toBe("yes");
  });
});
