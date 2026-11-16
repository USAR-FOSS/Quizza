import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getRedisPublisher, usesRedisRealtime } from "@/lib/redis/client";
import {
  toMemoryMetric,
  measureProbe,
  type HealthDiagnostics,
} from "./diagnostics-metrics";

export * from "./diagnostics-metrics";

/**
 * Executes platform diagnostic checks against Postgres, Redis, and runtime memory.
 */
export async function runHealthDiagnostics(): Promise<HealthDiagnostics> {
  const mem = process.memoryUsage();

  // Probe Postgres
  const pgProbe = await measureProbe(async () => {
    await db.execute(sql`select 1`);
  });

  // Probe Redis
  const redisUsesRealtime = usesRedisRealtime();
  let redisProbe: { latencyMs: number | null; error?: string };

  if (redisUsesRealtime) {
    redisProbe = await measureProbe(async () => {
      const client = await getRedisPublisher();
      await client.ping();
    });
  } else {
    redisProbe = { latencyMs: 0 };
  }

  const checks: HealthDiagnostics["checks"] = {
    postgres: {
      status: pgProbe.error ? "error" : "ok",
      latencyMs: pgProbe.latencyMs,
      ...(pgProbe.error ? { error: pgProbe.error } : {}),
    },
    redis: {
      status: !redisUsesRealtime
        ? "disabled"
        : redisProbe.error
          ? "error"
          : "ok",
      latencyMs: redisProbe.latencyMs,
      driver: redisUsesRealtime ? "redis" : "memory",
      ...(redisProbe.error ? { error: redisProbe.error } : {}),
    },
  };

  const isHealthy =
    checks.postgres.status === "ok" && checks.redis.status !== "error";
  const isDegraded =
    checks.postgres.status === "ok" && checks.redis.status === "error";

  return {
    ok: isHealthy,
    status: isHealthy ? "healthy" : isDegraded ? "degraded" : "unhealthy",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV ?? "development",
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rss: toMemoryMetric(mem.rss),
        heapUsed: toMemoryMetric(mem.heapUsed),
        heapTotal: toMemoryMetric(mem.heapTotal),
        external: toMemoryMetric(mem.external),
      },
    },
    checks,
  };
}
