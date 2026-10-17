import { handle, json, enforceRateLimit } from "@/lib/api/http";
import { getPublicSession } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  await enforceRateLimit(req, "session_info", 120, 60_000);
  const { code } = await params;
  const session = await getPublicSession(code);
  return json(session);
});
