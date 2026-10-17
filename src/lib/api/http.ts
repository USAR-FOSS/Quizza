import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

/** An error with an HTTP status and a stable machine code. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return NextResponse.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

/** Parse and validate a JSON body against a zod schema, or throw HttpError. */
export async function parseBody<S extends z.ZodType>(
  req: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(
      422,
      "validation_error",
      "Request failed validation",
      result.error.issues,
    );
  }
  return result.data;
}

/** Best-effort client IP for rate limiting. */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

/** Throw 429 if the caller has exceeded `limit` requests per `windowMs`. */
export async function enforceRateLimit(
  req: NextRequest,
  name: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const { ok, retryAfter } = await rateLimit(
    `${name}:${clientIp(req)}`,
    limit,
    windowMs,
  );
  if (!ok) {
    throw new HttpError(429, "rate_limited", `Too many requests. Try again in ${retryAfter}s.`);
  }
}

/** Read a Bearer token (used for the host token on host-only endpoints). */
export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wrap a route handler so thrown HttpErrors become clean JSON responses. */
export function handle<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return errorResponse(err.status, err.code, err.message, err.details);
      }
      console.error("[api] unhandled error", err);
      return errorResponse(500, "internal_error", "Something went wrong");
    }
  };
}
