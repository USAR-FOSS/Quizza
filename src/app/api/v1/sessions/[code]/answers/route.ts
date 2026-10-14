import type { NextRequest } from "next/server";
import { handle, json, parseBody, enforceRateLimit } from "@/lib/api/http";
import { SubmitAnswerBody } from "@/lib/api/schemas";
import { submitAnswer } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string }> };

export const POST = handle<Ctx>(async (req: NextRequest, { params }) => {
  enforceRateLimit(req, "submit", 180, 60_000);
  const { code } = await params;
  const body = await parseBody(req, SubmitAnswerBody);
  const result = await submitAnswer(code, body);
  return json(result);
});
