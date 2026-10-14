import type { NextRequest } from "next/server";
import { handle, json, parseBody, enforceRateLimit } from "@/lib/api/http";
import { JoinBody } from "@/lib/api/schemas";
import { joinSession } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string }> };

export const POST = handle<Ctx>(async (req: NextRequest, { params }) => {
  enforceRateLimit(req, "join", 30, 60_000);
  const { code } = await params;
  const body = await parseBody(req, JoinBody);
  const participant = await joinSession(code, body);
  return json(participant, 201);
});
