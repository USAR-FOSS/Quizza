import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  questions: null as any,
  options: [] as any[],
  insertedQuestion: [] as any[],
  insertedOptions: [] as any[],
  updatedQuestions: [] as any[],
  requireQuestionOwner: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("@/lib/quiz-access", () => ({
  requireQuizOwner: vi.fn().mockResolvedValue({ id: "quiz-1", ownerId: "user-1" }),
  requireQuestionOwner: mocks.requireQuestionOwner,
}));

vi.mock("@/lib/db", () => {
  const db = {
    query: {
      questions: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(mocks.questions)),
      },
      options: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(mocks.options[0])),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => Promise.resolve(mocks.options)),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mocks.insertedQuestion)),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => Promise.resolve(mocks.updatedQuestions)),
      }),
    }),
    transaction: vi.fn().mockImplementation((fn) => fn(db)),
  };
  return { db };
});

import { duplicateQuestion, reorderOptions } from "./quiz";

describe("duplicateQuestion and reorderOptions actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireQuestionOwner.mockResolvedValue({ id: "q-1", quizId: "quiz-1" });
    mocks.questions = {
      id: "q-1",
      quizId: "quiz-1",
      position: 0,
      type: "multiple_choice",
      prompt: "What is the capital of France?",
      mediaUrl: null,
      timeLimitSec: 20,
      points: 100,
      settings: {},
      options: [
        { id: "o-1", questionId: "q-1", position: 0, label: "Paris", isCorrect: true, color: "grape" },
        { id: "o-2", questionId: "q-1", position: 1, label: "London", isCorrect: false, color: "mint" },
      ],
    };
    mocks.options = [
      { id: "o-1", questionId: "q-1", position: 0 },
      { id: "o-2", questionId: "q-1", position: 1 },
    ];
    mocks.insertedQuestion = [
      {
        id: "q-2",
        quizId: "quiz-1",
        position: 1,
        type: "multiple_choice",
        prompt: "What is the capital of France?",
        mediaUrl: null,
        timeLimitSec: 20,
        points: 100,
        settings: {},
      },
    ];
  });

  it("duplicates question and its options into new sequential position", async () => {
    const result = await duplicateQuestion("q-1");
    expect(mocks.requireQuestionOwner).toHaveBeenCalledWith("q-1");
    expect(result.id).toBe("q-2");
    expect(result.prompt).toBe("What is the capital of France?");
  });

  it("reorders options atomically in transaction", async () => {
    await expect(reorderOptions("q-1", ["o-2", "o-1"])).resolves.not.toThrow();
  });

  it("rejects invalid option list in reorderOptions", async () => {
    await expect(reorderOptions("q-1", ["o-2"])).rejects.toThrow(
      "Option order must contain every option exactly once.",
    );
  });
});
