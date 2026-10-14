import { handle, json } from "@/lib/api/http";
import { getResults } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const { code } = await params;
  const results = await getResults(code);
  return json(results);
});
