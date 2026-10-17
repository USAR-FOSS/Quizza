import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  question: vi.fn(),
  quiz: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const db = {
    query: {
      questions: { findFirst: mocks.question },
      quizzes: { findFirst: mocks.quiz },
    },
    select: (selection?: Record<string, unknown>) => {
      let name: string;
      const chain = {
        from: (table: Parameters<typeof getTableName>[0]) => {
          name = getTableName(table);
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        for: () => chain,
        then: (resolve: (rows: unknown[]) => void) =>
          Promise.resolve(selection?.count ? [{ count: (mocks.rows.answers ?? []).filter((row) => Boolean((row as { powerup?: string | null }).powerup)).length }] : (mocks.rows[name] ?? [])).then(resolve),
      };
      return chain;
    },
    insert: () => ({ values: mocks.insert }),
    update: () => ({ set: () => ({ where: mocks.update }) }),
    transaction: mocks.transaction,
  };
  mocks.transaction.mockImplementation((fn) => fn(db));
  return { db };
});
vi.mock("@/lib/realtime/snapshot", () => ({ publishState: vi.fn() }));
vi.mock("@/lib/realtime/notifications", () => ({
  resetAnswerCounter: vi.fn(),
  scheduleAnswerCount: vi.fn(),
  scheduleRoster: vi.fn(),
}));
import { submitAnswer, getProgress, getResults, listQuestions } from "./sessions";
import { signViewToken } from "./view-token";

const question = {
  id: "question",
  quizId: "quiz",
  type: "multiple_choice",
  timeLimitSec: 20,
  points: 1000,
  settings: {},
  options: [
    { id: "correct", isCorrect: true },
    { id: "wrong", isCorrect: false },
  ],
};
const input = {
  questionId: "question",
  clientToken: "token",
  optionId: "correct",
};
const session = {
  id: "session",
  quizId: "quiz",
  mode: "live",
  status: "active",
  currentQuestionId: "question",
  revealed: false,
  questionStartedAt: new Date(),
  closesAt: null,
};

describe("answer integrity", () => {
  beforeEach(() => {
    mocks.rows = {
      sessions: [{ ...session, questionStartedAt: new Date() }],
      participants: [{ id: "player" }],
    };
    mocks.question.mockResolvedValue(question);
    mocks.quiz.mockResolvedValue({ settings: {} });
    mocks.insert.mockClear().mockResolvedValue(undefined);
    mocks.update.mockClear().mockResolvedValue(undefined);
  });
  it("rejects answers after the host reveals", async () => {
    mocks.rows.sessions = [{ ...session, revealed: true }];
    await expect(submitAnswer("123456", input)).rejects.toMatchObject({
      code: "not_current_question",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not leak a saved personal result before the live reveal", async () => {
    mocks.rows.answers = [
      { questionId: "question", isCorrect: true, points: 100, powerup: null },
    ];
    const progress = await getProgress("123456", "token");
    expect(progress.answered).toEqual(["question"]);
    expect(progress.results).toEqual({});
  });
  it("restores personal correctness after a shared reveal", async () => {
    mocks.rows.sessions = [{ ...session, revealed: true }];
    mocks.rows.answers = [
      { questionId: "question", isCorrect: true, points: 100, powerup: null },
    ];
    expect(
      (await getProgress("123456", "token")).results.question,
    ).toMatchObject({ revealed: true, isCorrect: true, pointsAwarded: 100 });
  });
  it("keeps personal correctness hidden when the host disables answers", async () => {
    mocks.rows.sessions = [{ ...session, revealed: true }];
    mocks.rows.answers = [
      { questionId: "question", isCorrect: true, points: 100, powerup: null },
    ];
    mocks.quiz.mockResolvedValue({ settings: { revealAnswers: "never" } });
    expect(
      (await getProgress("123456", "token")).results.question,
    ).toMatchObject({ revealed: false, isCorrect: null, pointsAwarded: null });
  });
  it("enforces the live deadline on the server", async () => {
    mocks.rows.sessions = [
      { ...session, questionStartedAt: new Date(Date.now() - 30_000) },
    ];
    await expect(
      submitAnswer("123456", { ...input, elapsedMs: 1 }),
    ).rejects.toMatchObject({ code: "question_expired" });
  });
  it("rejects missing or reissued scheduled view tokens even with a fast client time", async () => {
    mocks.rows.sessions = [
      {
        ...session,
        mode: "scheduled",
        opensAt: new Date(0),
        closesAt: new Date(Date.now() + 60_000),
      },
    ];
    mocks.rows.question_views = [{ startedAt: new Date(Date.now() - 10_000) }];
    await expect(
      submitAnswer("123456", { ...input, elapsedMs: 1 }),
    ).rejects.toMatchObject({ code: "invalid_view_token" });
    await expect(
      submitAnswer("123456", {
        ...input,
        viewToken: signViewToken("session", "question", "player"),
      }),
    ).rejects.toMatchObject({ code: "invalid_view_token" });
  });
  it("rejects an out-of-range scale answer", async () => {
    mocks.question.mockResolvedValue({
      ...question,
      type: "scale",
      settings: { scaleMin: 3, scaleMax: 7 },
      options: [],
    });
    await expect(
      submitAnswer("123456", { ...input, numberValue: 9 }),
    ).rejects.toMatchObject({ code: "invalid_number" });
  });
  it("rejects powerups unless enabled", async () => {
    await expect(
      submitAnswer("123456", { ...input, powerup: "double" }),
    ).rejects.toMatchObject({ code: "powerup_unavailable" });
  });
  it("records the boosted score and participant total in one transaction", async () => {
    mocks.quiz.mockResolvedValue({ settings: { powerups: true } });
    const result = await submitAnswer("123456", {
      ...input,
      powerup: "double",
    });
    expect(result).toMatchObject({
      revealed: false,
      pointsAwarded: null,
      isCorrect: null,
      correctOptionId: null,
    });
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ points: 2000, powerup: "double" }),
    );
    expect(mocks.update).toHaveBeenCalled();
  });
  it("shares one powerup charge across different powerup types", async () => {
    mocks.quiz.mockResolvedValue({ settings: { powerups: true, powerupUses: 1 } });
    mocks.rows.answers = [{ participantId: "player", powerup: "shield" }];
    await expect(submitAnswer("123456", { ...input, powerup: "double" }))
      .rejects.toMatchObject({ code: "powerup_used" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not accept live answers in the scheduled transport grace window", async () => {
    mocks.rows.sessions = [
      { ...session, questionStartedAt: new Date(Date.now() - 20_500) },
    ];
    await expect(submitAnswer("123456", input)).rejects.toMatchObject({
      code: "question_expired",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("inherits the quiz speed-scoring setting", async () => {
    mocks.rows.sessions = [
      { ...session, questionStartedAt: new Date(Date.now() - 10_000) },
    ];
    mocks.quiz.mockResolvedValue({ settings: { speedBonus: true } });
    await submitAnswer("123456", input);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ points: 750 }),
    );
  });
  it("allows a question to override quiz speed scoring", async () => {
    mocks.quiz.mockResolvedValue({ settings: { speedBonus: true } });
    mocks.question.mockResolvedValue({
      ...question,
      settings: { speedBonus: false },
    });
    await submitAnswer("123456", input);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ points: 1000 }),
    );
  });
});

describe("scheduled player results", () => {
  const scheduled = { ...session, mode: "scheduled", status: "active", closesAt: new Date(Date.now() + 3_600_000) };
  beforeEach(() => {
    mocks.rows = {
      sessions: [scheduled],
      participants: [{ id: "player", clientToken: "token", nickname: "Player", score: 100, joinedAt: new Date(), avatarColor: "mint", avatarUrl: null }],
      answers: [{ questionId: "question", participantId: "player", optionId: "correct", powerup: null }],
      question_views: [],
    };
    mocks.quiz.mockResolvedValue({ settings: { leaderboard: "at_end", revealAnswers: "at_end" }, questions: [{ ...question, prompt: "Which?", mediaUrl: "/api/v1/uploads/11111111-1111-4111-8111-111111111111", position: 0, options: [
      { id: "correct", label: "Yes", isCorrect: true, position: 0 },
      { id: "wrong", label: "No", isCorrect: false, position: 1 },
    ] }] });
  });
  it("shows answers and standings to a player who finished before the room closes", async () => {
    const result = await getResults("123456", { hostToken: null, clientToken: "token" });
    expect(result.showBoard).toBe(true);
    expect(result.showAnswers).toBe(true);
    expect(result.leaderboard).toHaveLength(1);
    expect(result.questionStats[0].options[0].isCorrect).toBe(true);
  });
  it("keeps unfinished and unauthenticated viewers out of early results", async () => {
    expect((await getResults("123456", { hostToken: null, clientToken: null })).leaderboard).toEqual([]);
    mocks.rows.answers = [];
    expect((await getResults("123456", { hostToken: null, clientToken: "token" })).leaderboard).toEqual([]);
  });
  it("keeps uploaded question images in the scheduled player payload", async () => {
    const list = await listQuestions("123456", "token");
    expect(list.questions[0].mediaUrl).toBe("/api/v1/uploads/11111111-1111-4111-8111-111111111111");
  });
});
