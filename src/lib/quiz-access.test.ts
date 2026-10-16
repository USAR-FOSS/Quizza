import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  quiz: vi.fn(),
  session: vi.fn(),
  question: vi.fn(),
  option: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      quizzes: { findFirst: mocks.quiz },
      sessions: { findFirst: mocks.session },
      questions: { findFirst: mocks.question },
      options: { findFirst: mocks.option },
    },
  },
}));
import {
  requireQuizOwner,
  requireQuestionOwner,
  requireOptionOwner,
} from "./quiz-access";

describe("authoring authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: "owner" });
    mocks.quiz.mockResolvedValue({ id: "quiz", ownerId: "owner" });
    mocks.session.mockResolvedValue(undefined);
    mocks.question.mockResolvedValue({ id: "question", quizId: "quiz" });
    mocks.option.mockResolvedValue({ id: "option", questionId: "question" });
  });
  it("requires a signed-in owner, including for direct option mutations", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(requireQuizOwner("quiz")).rejects.toThrow("Sign in");
    await expect(requireQuestionOwner("question")).rejects.toThrow("Sign in");
    await expect(requireOptionOwner("option")).rejects.toThrow("Sign in");
  });
  it("rejects another owner's and orphaned quizzes", async () => {
    mocks.quiz.mockResolvedValue({ ownerId: "someone-else" });
    await expect(requireOptionOwner("option")).rejects.toThrow("access denied");
    mocks.quiz.mockResolvedValue({ ownerId: null });
    await expect(requireQuizOwner("quiz")).rejects.toThrow("access denied");
  });
  it("locks edits during a running session but allows viewing and duplication", async () => {
    mocks.session.mockResolvedValue({ mode: "live", status: "active" });
    await expect(requireQuizOwner("quiz")).rejects.toThrow(
      "End the running session",
    );
    await expect(requireQuizOwner("quiz", false)).resolves.toMatchObject({
      ownerId: "owner",
    });
  });
  it("allows editing after a scheduled session's window expires", async () => {
    mocks.session.mockResolvedValue({
      mode: "scheduled",
      closesAt: new Date(0),
    });
    await expect(requireQuizOwner("quiz")).resolves.toMatchObject({
      ownerId: "owner",
    });
  });
});
