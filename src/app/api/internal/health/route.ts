import type { NextRequest } from "next/server";
import { runHealthDiagnostics, evaluateHealthAuth } from "@/lib/diagnostics";

export async function GET(request: NextRequest) {
  const expected = process.env.INTERNAL_HEALTH_SECRET;
  // Security: accept secret strictly via header to prevent credential leakage in query strings
  const supplied = request.headers.get("x-internal-health-secret");

  const auth = evaluateHealthAuth(expected, supplied);

  if (auth.kind === "liveness") {
    // Basic liveness probe (safe for unauthenticated monitoring)
    return Response.json(
      { ok: true, status: "alive" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  if (auth.kind === "disabled") {
    // Fail-closed when secret is unconfigured
    return Response.json(
      { ok: false, error: auth.error },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (auth.kind === "unauthorized") {
    // Reject invalid credentials
    return Response.json(
      { ok: false, error: auth.error },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  // Full detailed diagnostics (requires valid internal health secret)
  const diagnostics = await runHealthDiagnostics();

  return Response.json(diagnostics, {
    status: diagnostics.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
