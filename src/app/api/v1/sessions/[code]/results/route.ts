import type { NextRequest } from "next/server";
import { handle, json, bearerToken } from "@/lib/api/http";
import { getResults } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string }> };

export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  const { code } = await params;
  const results = await getResults(code, {
    hostToken: bearerToken(req),
    clientToken: req.headers.get("x-client-token"),
  });
  return json(results);
});
