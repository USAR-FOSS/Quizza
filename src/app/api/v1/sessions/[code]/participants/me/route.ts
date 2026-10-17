import type { NextRequest } from "next/server";
import { enforceRateLimit, handle, json } from "@/lib/api/http";
import { getProgress } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string }> };
export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  await enforceRateLimit(req, "progress", 120, 60_000);
  const { code } = await params;
  return json(await getProgress(code, req.headers.get("x-client-token")));
});
