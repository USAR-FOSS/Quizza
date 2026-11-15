import type { NextRequest } from "next/server";
import { handle, json, HttpError } from "@/lib/api/http";
import { requireAdminUser } from "@/lib/auth";
import { terminateSessionAsAdmin } from "@/lib/admin";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle<Ctx>(async (_req: NextRequest, { params }) => {
  try {
    await requireAdminUser();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("401")) throw new HttpError(401, "unauthorized", "Sign in required");
    throw new HttpError(403, "forbidden", "Administrative privileges required");
  }

  const { id } = await params;
  const result = await terminateSessionAsAdmin(id);
  return json(result);
});
