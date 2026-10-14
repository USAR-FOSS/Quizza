import type { NextRequest } from "next/server";
import { handle, json, parseBody, enforceRateLimit } from "@/lib/api/http";
import { CreateSessionBody } from "@/lib/api/schemas";
import { createSession } from "@/lib/sessions";

export const POST = handle(async (req: NextRequest) => {
  enforceRateLimit(req, "create_session", 30, 60_000);
  const body = await parseBody(req, CreateSessionBody);
  const session = await createSession(body);
  return json(session, 201);
});
