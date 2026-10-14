import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/api/openapi";

// Served fresh; the document is cheap to build and reflects the current schemas.
export function GET() {
  return NextResponse.json(buildOpenApiDocument());
}
