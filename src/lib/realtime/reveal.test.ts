import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  question: vi.fn(),
  changed: vi.fn(),
  publishState: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mocks.session()),
        }),
      }),
    }),
    query: { questions: { findFirst: mocks.question } },
    update: () => ({
      set: () => ({
        where: () => ({ returning: mocks.changed }),
      }),
    }),
  },
}));
vi.mock("./snapshot", () => ({ publishState: mocks.publishState }));

import { revealDueQuestion } from "./reveal";

const startedAt = new Date(Date.now() - 10_000);
const job = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  questionId: "22222222-2222-4222-8222-222222222222",
  questionStartedAt: startedAt.toISOString(),
};

describe("durable live reveal", () => {
  beforeEach(() => {
    mocks.session.mockReset();
    mocks.question.mockReset();
    mocks.changed.mockReset();
    mocks.publishState.mockReset();
  });

  it("ignores a callback for a room that already moved on", async () => {
    mocks.session.mockReturnValue([]);
    await expect(revealDueQuestion(job)).resolves.toEqual({ status: "stale" });
    expect(mocks.changed).not.toHaveBeenCalled();
  });

  it("asks QStash to retry if delivery arrives before the deadline", async () => {
    const future = new Date(Date.now() + 10_000);
    mocks.session.mockReturnValue([
      {
        id: job.sessionId,
        mode: "live",
        status: "active",
        currentQuestionId: job.questionId,
        revealed: false,
        questionStartedAt: future,
      },
    ]);
    mocks.question.mockResolvedValue({ timeLimitSec: 20 });
    await expect(
      revealDueQuestion({ ...job, questionStartedAt: future.toISOString() }),
    ).resolves.toMatchObject({ status: "early" });
    expect(mocks.changed).not.toHaveBeenCalled();
  });

  it("reveals exactly once when the callback is due", async () => {
    mocks.session.mockReturnValue([
      {
        id: job.sessionId,
        mode: "live",
        status: "active",
        currentQuestionId: job.questionId,
        revealed: false,
        questionStartedAt: startedAt,
      },
    ]);
    mocks.question.mockResolvedValue({ timeLimitSec: 1 });
    mocks.changed.mockResolvedValue([{ id: job.sessionId }]);

    await expect(revealDueQuestion(job)).resolves.toEqual({ status: "revealed" });
    expect(mocks.publishState).toHaveBeenCalledWith(job.sessionId);
  });
});
