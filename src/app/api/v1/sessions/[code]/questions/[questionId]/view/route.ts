import type { NextRequest } from "next/server";
import { handle, json, enforceRateLimit } from "@/lib/api/http";
import { issueViewToken } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string; questionId: string }> };

export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  enforceRateLimit(req, "view", 300, 60_000);
  const { code, questionId } = await params;
  const token = req.headers.get("x-client-token");
  return json(await issueViewToken(code, questionId, token));
});
