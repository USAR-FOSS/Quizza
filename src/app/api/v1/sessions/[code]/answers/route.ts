import type { NextRequest } from "next/server";
import { handle, json, parseBody, enforceRateLimit } from "@/lib/api/http";
import { SubmitAnswerBody } from "@/lib/api/schemas";
import { submitAnswer } from "@/lib/sessions";
import { rateLimit } from "@/lib/rate-limit";
import { HttpError } from "@/lib/api/http";

type Ctx = { params: Promise<{ code: string }> };

export const POST = handle<Ctx>(async (req: NextRequest, { params }) => {
  // A venue can put the whole audience behind one NAT address. Keep a broad
  // IP guard, then apply the useful tight limit to each participant token.
  await enforceRateLimit(req, "submit", 10_000, 60_000);
  const { code } = await params;
  const body = await parseBody(req, SubmitAnswerBody);
  const resultLimit = await rateLimit(`submit:${body.clientToken}`, 12, 60_000);
  if (!resultLimit.ok)
    throw new HttpError(429, "rate_limited", `Too many answers. Try again in ${resultLimit.retryAfter}s.`);
  const result = await submitAnswer(code, body);
  return json(result);
});
