import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getRedisPublisher, usesRedisRealtime } from "@/lib/redis/client";

export async function GET(request: NextRequest) {
  const expected = process.env.INTERNAL_HEALTH_SECRET;
  const supplied = request.headers.get("x-internal-health-secret");
  if (!expected || !supplied || supplied !== expected)
    return Response.json({ ok: false }, { status: 404 });

  const checks: { postgres: "ok" | "error"; redis: "ok" | "error" } = {
    postgres: "error",
    redis: "error",
  };
  try {
    await db.execute(sql`select 1`);
    checks.postgres = "ok";
  } catch (error) {
    console.error("[health] postgres failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!usesRedisRealtime()) checks.redis = "ok";
  else {
    try {
      await (await getRedisPublisher()).ping();
      checks.redis = "ok";
    } catch (error) {
      console.error("[health] redis failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ok = checks.postgres === "ok" && checks.redis === "ok";
  return Response.json(
    { ok, checks },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
