import { Receiver } from "@upstash/qstash";
import { revealDueQuestion } from "@/lib/realtime/reveal";
import type { RevealJob } from "@/lib/realtime/reveal";

function receiver(): Receiver {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey)
    throw new Error("QStash signing keys are not configured");
  return new Receiver({ currentSigningKey, nextSigningKey });
}

export async function POST(request: Request) {
  const signature = request.headers.get("Upstash-Signature");
  const body = await request.text();
  if (!signature) return new Response("Missing QStash signature", { status: 401 });

  try {
    const appUrl = process.env.APP_URL?.replace(/\/$/, "");
    const verificationUrl = appUrl
      ? `${appUrl}/api/internal/realtime/reveal`
      : request.url;
    await receiver().verify({
      signature,
      body,
      url: verificationUrl,
    });
  } catch {
    return new Response("Invalid QStash signature", { status: 401 });
  }

  let job: RevealJob;
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as RevealJob).sessionId !== "string" ||
      typeof (parsed as RevealJob).questionId !== "string" ||
      typeof (parsed as RevealJob).questionStartedAt !== "string"
    )
      return new Response("Invalid reveal job", { status: 400 });
    job = parsed as RevealJob;
  } catch {
    return new Response("Invalid reveal job", { status: 400 });
  }

  try {
    const result = await revealDueQuestion(job);
    if (result.status === "early")
      return new Response("Reveal is not due yet", {
        status: 425,
        headers: { "retry-after": String(result.retryAfter) },
      });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[realtime] reveal callback failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Temporary reveal failure", { status: 503 });
  }
}
