import type { NextRequest } from "next/server";
import { exportCsv } from "@/lib/sessions";
import { bearerToken, errorResponse, HttpError } from "@/lib/api/http";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const host = bearerToken(req);
  try {
    const csv = await exportCsv(code, host);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="quizza-${code}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof HttpError)
      return errorResponse(err.status, err.code, err.message);
    console.error("[export] failed", err);
    return errorResponse(500, "internal_error", "Export failed");
  }
}
