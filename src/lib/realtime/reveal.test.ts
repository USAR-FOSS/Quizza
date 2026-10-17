import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  settle: vi.fn(),
  publishState: vi.fn(),
}));

vi.mock("./settlement", () => ({ settleDueQuestion: mock.settle }));
vi.mock("./snapshot", () => ({ publishState: mock.publishState }));

import { revealDueQuestion } from "./reveal";

const job = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  questionId: "22222222-2222-4222-8222-222222222222",
  questionStartedAt: "2026-10-17T12:00:00.000Z",
};

describe("durable live reveal publication", () => {
  beforeEach(() => {
    mock.settle.mockReset();
    mock.publishState.mockReset();
  });

  it.each(["stale", "early"] as const)(
    "does not publish a %s job",
    async (status) => {
      mock.settle.mockResolvedValue({ status });
      expect(await revealDueQuestion(job)).toEqual({ status });
      expect(mock.publishState).not.toHaveBeenCalled();
    },
  );

  it("publishes the committed reveal exactly once", async () => {
    mock.settle.mockResolvedValue({ status: "revealed" });
    expect(await revealDueQuestion(job)).toEqual({ status: "revealed" });
    expect(mock.publishState).toHaveBeenCalledOnce();
    expect(mock.publishState).toHaveBeenCalledWith(job.sessionId);
  });
  it("re-publishes an already committed reveal so a failed publish can be retried", async () => {
    mock.settle.mockResolvedValue({ status: "already_revealed" });
    expect(await revealDueQuestion(job)).toEqual({ status: "already_revealed" });
    expect(mock.publishState).toHaveBeenCalledWith(job.sessionId);
  });
});
