import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as any,
  question: null as any,
  updatedSession: [] as any[],
  scheduledReveal: vi.fn(),
  settleDueQuestion: vi.fn(),
  publishState: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  return {
    db: {
      query: {
        sessions: {
          findFirst: vi.fn().mockImplementation(() => Promise.resolve(mocks.session)),
        },
        questions: {
          findFirst: vi.fn().mockImplementation(() => Promise.resolve(mocks.question)),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => Promise.resolve(mocks.updatedSession)),
          }),
        }),
      }),
    },
  };
});

vi.mock("@/lib/realtime/scheduler", () => ({
  scheduleReveal: mocks.scheduledReveal,
}));

vi.mock("@/lib/realtime/settlement", () => ({
  settleDueQuestion: mocks.settleDueQuestion,
}));

vi.mock("@/lib/realtime/snapshot", () => ({
  publishState: mocks.publishState,
}));

vi.mock("@/lib/realtime/notifications", () => ({
  resetAnswerCounter: vi.fn(),
}));

import { controlSession } from "./sessions";

describe("controlSession live host controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = {
      id: "session-1",
      quizId: "quiz-1",
      code: "123456",
      mode: "live",
      status: "active",
      revealed: false,
      hostToken: "secret-host-token",
      currentQuestionId: "q-1",
      questionStartedAt: new Date(Date.now() - 5000),
    };
    mocks.question = {
      id: "q-1",
      timeLimitSec: 20,
    };
    mocks.updatedSession = [{ id: "session-1" }];
    mocks.settleDueQuestion.mockResolvedValue({ status: "revealed" });
  });

  it("rejects control with wrong host token", async () => {
    await expect(
      controlSession("123456", "wrong-token", "extend"),
    ).rejects.toThrow("Invalid host token");
  });

  it("extends question timer by +15 seconds and reschedules reveal", async () => {
    const originalStart = mocks.session.questionStartedAt.getTime();
    const result = await controlSession("123456", "secret-host-token", "extend");

    expect(result).toEqual({ ok: true });
    expect(mocks.scheduledReveal).toHaveBeenCalledTimes(1);
    const scheduledCall = mocks.scheduledReveal.mock.calls[0];
    const newStartedAt = new Date(scheduledCall[0].questionStartedAt).getTime();
    expect(newStartedAt).toBe(originalStart + 15_000);
    expect(mocks.publishState).toHaveBeenCalledWith("session-1");
  });

  it("stops timer early and settles round immediately with force flag", async () => {
    const result = await controlSession("123456", "secret-host-token", "stop_timer");

    expect(result).toEqual({ ok: true });
    expect(mocks.settleDueQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        questionId: "q-1",
        force: true,
      }),
    );
    expect(mocks.publishState).toHaveBeenCalledWith("session-1");
  });

  it("rejects extending when session is already revealed", async () => {
    mocks.session.revealed = true;
    await expect(
      controlSession("123456", "secret-host-token", "extend"),
    ).rejects.toThrow("There is no running question to extend");
  });
});
