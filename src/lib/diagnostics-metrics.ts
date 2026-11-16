export type MemoryMetric = {
  bytes: number;
  megabytes: number;
};

export type ServiceProbe = {
  status: "ok" | "error" | "disabled";
  latencyMs: number | null;
  error?: string;
  driver?: string;
};

export type HealthDiagnostics = {
  ok: boolean;
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  system: {
    nodeVersion: string;
    platform: string;
    memory: {
      rss: MemoryMetric;
      heapUsed: MemoryMetric;
      heapTotal: MemoryMetric;
      external: MemoryMetric;
    };
  };
  checks: {
    postgres: ServiceProbe;
    redis: ServiceProbe;
  };
};

export type HealthAuthResult =
  | { kind: "liveness"; status: 200 }
  | { kind: "diagnostics"; status: 200 }
  | { kind: "unauthorized"; status: 401; error: string }
  | { kind: "disabled"; status: 503; error: string };

/**
 * Evaluates authorization for the internal health check endpoint.
 *
 * Anti-leak & security rules:
 * - Accept secret through headers ONLY (`x-internal-health-secret`).
 * - Query parameters like `?secret=` are strictly ignored to prevent URL leaks in access logs.
 * - Fail-closed: If `INTERNAL_HEALTH_SECRET` is absent/empty, diagnostics are disabled.
 * - Keep unauthenticated liveness and authenticated diagnostics strictly separate.
 */
export function evaluateHealthAuth(
  expectedSecret: string | undefined | null,
  headerSecret: string | undefined | null,
): HealthAuthResult {
  const hasExpected = Boolean(expectedSecret && expectedSecret.trim().length > 0);
  const supplied = headerSecret?.trim();

  // If no header supplied, return lightweight unauthenticated liveness probe
  if (!supplied) {
    return { kind: "liveness", status: 200 };
  }

  // Caller supplied a header requesting deep diagnostics:
  if (!hasExpected) {
    return {
      kind: "disabled",
      status: 503,
      error: "Health diagnostics disabled: internal secret is unconfigured",
    };
  }

  if (supplied !== expectedSecret) {
    return {
      kind: "unauthorized",
      status: 401,
      error: "Unauthorized: invalid internal health secret",
    };
  }

  return { kind: "diagnostics", status: 200 };
}

/** Formats bytes to megabytes rounded to two decimal places. */
export function formatBytesToMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/** Formats a byte quantity into a MemoryMetric record. */
export function toMemoryMetric(bytes: number): MemoryMetric {
  return {
    bytes,
    megabytes: formatBytesToMb(bytes),
  };
}

/**
 * Measures the execution duration of an asynchronous probe in milliseconds.
 */
export async function measureProbe(
  probeFn: () => Promise<unknown>,
): Promise<{ latencyMs: number | null; error?: string }> {
  const start = performance.now();
  try {
    await probeFn();
    const duration = Math.round((performance.now() - start) * 100) / 100;
    return { latencyMs: duration };
  } catch (err) {
    return {
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
