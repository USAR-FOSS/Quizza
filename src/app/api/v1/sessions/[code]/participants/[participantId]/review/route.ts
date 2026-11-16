import type { NextRequest } from "next/server";
import { handle, json, bearerToken } from "@/lib/api/http";
import { getParticipantReview } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string; participantId: string }> };

export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  const { code, participantId } = await params;
  const hostToken = bearerToken(req) || req.headers.get("x-host-token");
  const clientToken = req.headers.get("x-client-token");
  const review = await getParticipantReview(code, participantId, {
    hostToken,
    clientToken,
  });
  return json(review);
});
