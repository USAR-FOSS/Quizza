import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, json, parseBody, bearerToken, HttpError } from "@/lib/api/http";
import { controlSession } from "@/lib/sessions";

const ControlBody = z.object({
  action: z.enum(["start", "reveal", "next", "end"]),
});

type Ctx = { params: Promise<{ code: string }> };

export const POST = handle<Ctx>(async (req: NextRequest, { params }) => {
  const { code } = await params;
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, "missing_token", "Host token required");
  const { action } = await parseBody(req, ControlBody);
  const result = await controlSession(code, token, action);
  return json(result);
});
