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

/** Maximum allowed JSON body size in bytes (64 KB). Supported JSON payloads are < 10 KB. */
export const DEFAULT_MAX_JSON_BYTES = 64 * 1024; // 64 KB

/**
 * Read request body with a hard byte count limit, supporting streamed chunks
 * even when Content-Length is missing or omitted.
 */
export async function readBoundedJson(
  req: NextRequest | Request,
  maxBytes: number = DEFAULT_MAX_JSON_BYTES,
): Promise<unknown> {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const len = parseInt(contentLength, 10);
    if (!Number.isNaN(len) && len > maxBytes) {
      throw new HttpError(
        413,
        "payload_too_large",
        `Request body exceeds maximum size of ${maxBytes} bytes`,
      );
    }
  }

  if (!req.body) {
    let text = "";
    try {
      text = await req.text();
    } catch {
      throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
    }
    if (!text.trim()) {
      throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
    }
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new HttpError(
        413,
        "payload_too_large",
        `Request body exceeds maximum size of ${maxBytes} bytes`,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
    }
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancel error
          }
          throw new HttpError(
            413,
            "payload_too_large",
            `Request body exceeds maximum size of ${maxBytes} bytes`,
          );
        }
        chunks.push(value);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore release error
    }
  }

  if (totalBytes === 0) {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }

  const allBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    allBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(allBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

/** Parse and validate a JSON body against a zod schema, enforcing byte limits or throwing HttpError. */
export async function parseBody<S extends z.ZodType>(
  req: NextRequest | Request,
  schema: S,
  maxBytes: number = DEFAULT_MAX_JSON_BYTES,
): Promise<z.infer<S>> {
  const raw = await readBoundedJson(req, maxBytes);
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
