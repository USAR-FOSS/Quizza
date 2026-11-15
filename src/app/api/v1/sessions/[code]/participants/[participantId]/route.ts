import type { NextRequest } from "next/server";
import { handle, json, HttpError, bearerToken } from "@/lib/api/http";
import { kickParticipant } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string; participantId: string }> };

export const DELETE = handle<Ctx>(async (req: NextRequest, { params }) => {
  const token = bearerToken(req) || req.headers.get("x-host-token");
  if (!token) {
    throw new HttpError(401, "missing_token", "Host token required");
  }
  const { code, participantId } = await params;
  const result = await kickParticipant(code, token, participantId);
  return json(result);
});
