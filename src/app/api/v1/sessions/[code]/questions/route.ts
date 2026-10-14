import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api/http";
import { listQuestions } from "@/lib/sessions";

type Ctx = { params: Promise<{ code: string }> };

export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  const { code } = await params;
  const token = req.headers.get("x-client-token");
  const data = await listQuestions(code, token);
  return json(data);
});
