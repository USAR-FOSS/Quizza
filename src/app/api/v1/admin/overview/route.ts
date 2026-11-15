import type { NextRequest } from "next/server";
import { handle, json, HttpError } from "@/lib/api/http";
import { requireAdminUser } from "@/lib/auth";
import { getAdminOverview } from "@/lib/admin";

export const GET = handle(async (_req: NextRequest) => {
  try {
    await requireAdminUser();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("401")) throw new HttpError(401, "unauthorized", "Sign in required");
    throw new HttpError(403, "forbidden", "Administrative privileges required");
  }

  const overview = await getAdminOverview();
  return json(overview);
});
