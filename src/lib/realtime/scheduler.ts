import { Client } from "@upstash/qstash";
import { createHash } from "node:crypto";

type RevealJob = {
  sessionId: string;
  questionId: string;
  questionStartedAt: string;
};

const globalScheduler = globalThis as typeof globalThis & {
  quizzaQstash?: Client;
};

function schedulerClient(): Client {
  const token = process.env.QSTASH_TOKEN;
  if (!token)
    throw new Error("QSTASH_TOKEN is required for production live reveals");
  return (globalScheduler.quizzaQstash ??= new Client({ token }));
}

function revealUrl(): string {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) throw new Error("APP_URL is required for QStash reveal callbacks");
  return `${appUrl}/api/internal/realtime/reveal`;
}

export function revealDeduplicationId(job: RevealJob): string {
  const identity = `${job.sessionId}:${job.questionId}:${job.questionStartedAt}`;
  return `reveal-${createHash("sha256").update(identity).digest("hex")}`;
}

/** Schedules one idempotent callback at the exact server deadline. */
export async function scheduleReveal(job: RevealJob, deadlineMs: number) {
  const localDevelopment = process.env.APP_URL?.startsWith("http://localhost");
  if (!process.env.QSTASH_TOKEN &&
      (process.env.NODE_ENV !== "production" || localDevelopment))
    return { mode: "local" as const };
  const result = await schedulerClient().publishJSON({
    url: revealUrl(),
    body: job,
    notBefore: Math.ceil(deadlineMs / 1000),
    retries: 5,
    retryDelay: "1000 * (1 + retried)",
    deduplicationId: revealDeduplicationId(job),
  });
  console.info("[realtime] reveal scheduled", {
    sessionId: job.sessionId,
    questionId: job.questionId,
    messageId: result.messageId,
    deadline: new Date(deadlineMs).toISOString(),
  });
  return { mode: "qstash" as const, messageId: result.messageId };
}
