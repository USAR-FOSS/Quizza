import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  quiz: vi.fn(),
  session: vi.fn(),
  question: vi.fn(),
  option: vi.fn(),
  uploadSelect: vi.fn(),
  uploadInsert: vi.fn(),
  questionInsert: vi.fn(),
  optionInsert: vi.fn(),
  questionsUpdate: vi.fn(),
  optionsQuery: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.user,
}));

vi.mock("@/lib/db", () => {
  const txMock = {
    update: (table: Parameters<typeof getTableName>[0]) => {
      const name = getTableName(table);
      return {
        set: (setData: Record<string, unknown>) => ({
          where: (clause: unknown) => {
            if (name === "questions") {
              mocks.questionsUpdate(setData, clause);
            }
            return Promise.resolve();
          },
        }),
      };
    },
    select: () => {
      let targetTable: string;
      const chain = {
        from: (table: Parameters<typeof getTableName>[0]) => {
          targetTable = getTableName(table);
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        then: (resolve: (rows: unknown[]) => void) => {
          if (targetTable === "uploads") {
            return Promise.resolve(mocks.uploadSelect()).then(resolve);
          }
          if (targetTable === "options") {
            return Promise.resolve(mocks.optionsQuery()).then(resolve);
          }
          return Promise.resolve([]).then(resolve);
        },
      };
      return chain;
    },
    insert: (table: Parameters<typeof getTableName>[0]) => {
      const name = getTableName(table);
      return {
        values: (vals: unknown) => ({
          returning: () => {
            if (name === "uploads") return mocks.uploadInsert(vals);
            if (name === "questions") return mocks.questionInsert(vals);
            if (name === "options") return mocks.optionInsert(vals);
            return Promise.resolve([]);
          },
        }),
      };
    },
  };

  const db = {
    query: {
      quizzes: { findFirst: mocks.quiz },
      sessions: { findFirst: mocks.session },
      questions: { findFirst: mocks.question },
      options: { findFirst: mocks.option },
    },
    transaction: vi.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };

  return { db };
});

import { duplicateQuestion } from "./quiz";

describe("duplicateQuestion", () => {
  const originalQuestionId = "11111111-1111-4111-8111-111111111111";
  const quizId = "22222222-2222-4222-8222-222222222222";
  const userId = "user-123";

  beforeEach(() => {
    vi.resetAllMocks();

    mocks.user.mockResolvedValue({ id: userId });
    mocks.quiz.mockResolvedValue({ id: quizId, ownerId: userId });
    mocks.session.mockResolvedValue(undefined); // No running sessions by default

    mocks.question.mockResolvedValue({
      id: originalQuestionId,
      quizId,
      type: "multiple_choice",
      position: 1,
      prompt: "What is the capital of France?",
      timeLimitSec: 30,
      points: 1000,
      mediaUrl: "https://example.com/paris.jpg",
      settings: { speedBonus: true },
    });

    mocks.optionsQuery.mockResolvedValue([
      {
        id: "opt-1",
        questionId: originalQuestionId,
        position: 0,
        label: "Paris",
        isCorrect: true,
        color: "mint",
      },
      {
        id: "opt-2",
        questionId: originalQuestionId,
        position: 1,
        label: "London",
        isCorrect: false,
        color: "coral",
      },
    ]);

    mocks.questionInsert.mockImplementation((vals: Record<string, unknown>) => [
      {
        ...vals,
        id: "33333333-3333-4333-8333-333333333333",
      },
    ]);

    mocks.optionInsert.mockImplementation((vals: Array<Record<string, unknown>>) =>
      vals.map((v, i) => ({
        ...v,
        id: `new-opt-${i + 1}`,
      })),
    );
  });

  it("copies prompt, settings, media, and options with new unique identifiers", async () => {
    const result = await duplicateQuestion(originalQuestionId);

    expect(result.id).toBe("33333333-3333-4333-8333-333333333333");
    expect(result.id).not.toBe(originalQuestionId);
    expect(result.prompt).toBe("What is the capital of France?");
    expect(result.type).toBe("multiple_choice");
    expect(result.timeLimitSec).toBe(30);
    expect(result.points).toBe(1000);
    expect(result.mediaUrl).toBe("https://example.com/paris.jpg");
    expect(result.settings).toEqual({ speedBonus: true });

    expect(result.options).toHaveLength(2);
    expect(result.options[0]).toMatchObject({
      id: "new-opt-1",
      questionId: result.id,
      position: 0,
      label: "Paris",
      isCorrect: true,
      color: "mint",
    });
    expect(result.options[1]).toMatchObject({
      id: "new-opt-2",
      questionId: result.id,
      position: 1,
      label: "London",
      isCorrect: false,
      color: "coral",
    });
    expect(result.options[0].id).not.toBe("opt-1");
    expect(result.options[1].id).not.toBe("opt-2");
  });

  it("inserts at predictable position (original.position + 1) and shifts subsequent questions", async () => {
    const result = await duplicateQuestion(originalQuestionId);

    // Original position was 1, so duplicate must be 2
    expect(result.position).toBe(2);
    expect(mocks.questionsUpdate).toHaveBeenCalled();
  });

  it("clones uploaded asset when mediaUrl is an internal upload for asset isolation", async () => {
    const uploadId = "44444444-4444-4444-8444-444444444444";
    const newUploadId = "55555555-5555-4555-8555-555555555555";
    mocks.question.mockResolvedValueOnce({
      id: originalQuestionId,
      quizId,
      type: "multiple_choice",
      position: 0,
      prompt: "Identify the image",
      timeLimitSec: 20,
      points: 500,
      mediaUrl: `/api/v1/uploads/${uploadId}`,
      settings: {},
    });

    mocks.uploadSelect.mockReturnValueOnce([
      {
        id: uploadId,
        quizId,
        ownerId: userId,
        contentType: "image/png",
        data: "base64data",
      },
    ]);

    mocks.uploadInsert.mockReturnValueOnce([{ id: newUploadId }]);

    const result = await duplicateQuestion(originalQuestionId);

    expect(result.mediaUrl).toBe(`/api/v1/uploads/${newUploadId}`);
    expect(result.mediaUrl).not.toBe(`/api/v1/uploads/${uploadId}`);
  });

  it("rejects if user is not signed in", async () => {
    mocks.user.mockResolvedValue(null);

    await expect(duplicateQuestion(originalQuestionId)).rejects.toThrow("Sign in");
  });

  it("rejects if caller does not own the quiz", async () => {
    mocks.quiz.mockResolvedValue({ id: quizId, ownerId: "different-user" });

    await expect(duplicateQuestion(originalQuestionId)).rejects.toThrow("access denied");
  });

  it("preserves active-session edit locks by rejecting during running live session", async () => {
    mocks.session.mockResolvedValue({
      id: "sess-1",
      mode: "live",
      status: "active",
      closesAt: null,
    });

    await expect(duplicateQuestion(originalQuestionId)).rejects.toThrow(
      "End the running session before editing this quiz",
    );
  });
});
