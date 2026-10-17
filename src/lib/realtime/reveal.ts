import { publishState } from "./snapshot";
import { settleDueQuestion, type RevealJob, type RevealResult } from "./settlement";
export type { RevealJob, RevealResult };

/** Applies a QStash reveal only to the exact still-running round. */
export async function revealDueQuestion(job: RevealJob): Promise<RevealResult> {
  const result = await settleDueQuestion(job);
  if (result.status !== "revealed" && result.status !== "already_revealed") return result;
  await publishState(job.sessionId);
  console.info("[realtime] reveal completed", {
    sessionId: job.sessionId,
    questionId: job.questionId,
  });
  return result;
}
