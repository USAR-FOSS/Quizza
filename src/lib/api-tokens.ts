import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { HttpError } from "@/lib/api/http";
import { authSecret } from "@/lib/auth-secret";

/**
 * Supported fine-grained API permission scopes for external clients.
 * - `sessions:read`: View session telemetry, participants, and live status.
 * - `sessions:write`: Control room state (start, advance question, end session).
 * - `quiz:manage`: Create, edit, and duplicate quizzes and questions.
 * - `webhooks:listen`: Register and receive HMAC-signed lifecycle webhook payloads.
 */
export const API_SCOPES = [
  "sessions:read",
  "sessions:write",
  "quiz:manage",
  "webhooks:listen",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export interface ScopedTokenPayload {
  sub: string; // User ID / Account owner
  scopes: ApiScope[];
  clientId?: string;
  name?: string;
  jti?: string;
}

export interface GenerateScopedTokenOptions {
  expiresIn?: string; // e.g. "30d", "1h", "90d"
  secret?: string | Uint8Array;
}

export interface VerifyScopedTokenOptions {
  secret?: string | Uint8Array;
  now?: Date;
}

const TOKEN_ISSUER = "quizza:api";
const TOKEN_AUDIENCE = "quizza:api:v1";

function resolveSecretKey(secret?: string | Uint8Array): Uint8Array {
  if (secret instanceof Uint8Array) return secret;
  if (typeof secret === "string") return new TextEncoder().encode(secret);
  return new TextEncoder().encode(authSecret());
}

/**
 * Checks if all required scopes are present in granted scopes.
 */
export function hasRequiredScopes(
  granted: ApiScope[],
  required: ApiScope[]
): boolean {
  if (required.length === 0) return true;
  const grantedSet = new Set<string>(granted);
  return required.every((scope) => grantedSet.has(scope));
}

/**
 * Generates an HMAC-SHA256 signed JWT for external API integrations with fine-grained scopes.
 */
export async function generateScopedApiToken(
  payload: ScopedTokenPayload,
  options: GenerateScopedTokenOptions = {}
): Promise<string> {
  const secret = resolveSecretKey(options.secret);
  const jti = payload.jti ?? randomUUID();
  const expiresIn = options.expiresIn ?? "30d";

  const builder = new SignJWT({
    scopes: payload.scopes,
    clientId: payload.clientId,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(expiresIn);

  return builder.sign(secret);
}

export type VerifyScopedTokenResult =
  | { valid: true; payload: ScopedTokenPayload; jti: string; reason?: undefined }
  | { valid: false; payload?: undefined; jti?: undefined; reason: string };

/**
 * Verifies an external client scoped JWT token and validates that all required scopes are granted.
 */
export async function verifyScopedApiToken(
  token: string,
  requiredScopes: ApiScope[] = [],
  options: VerifyScopedTokenOptions = {}
): Promise<VerifyScopedTokenResult> {
  try {
    const secret = resolveSecretKey(options.secret);
    const { payload } = await jwtVerify(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      currentDate: options.now,
    });

    if (!payload.sub) {
      return { valid: false, reason: "missing_subject" };
    }

    const rawScopes = Array.isArray(payload.scopes) ? payload.scopes : [];
    const validScopes = rawScopes.filter((s): s is ApiScope =>
      (API_SCOPES as readonly string[]).includes(s)
    );

    if (!hasRequiredScopes(validScopes, requiredScopes)) {
      return { valid: false, reason: "insufficient_scope" };
    }

    return {
      valid: true,
      jti: payload.jti ?? "",
      payload: {
        sub: payload.sub,
        scopes: validScopes,
        clientId: typeof payload.clientId === "string" ? payload.clientId : undefined,
        name: typeof payload.name === "string" ? payload.name : undefined,
      },
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "JWTExpired") {
      return { valid: false, reason: "token_expired" };
    }
    return { valid: false, reason: "invalid_token" };
  }
}

/**
 * Middleware authentication helper for API routes.
 * Parses the `Authorization: Bearer <token>` header, verifies the token,
 * and enforces that the token possesses all required scopes.
 *
 * Throws `HttpError` (401 unauthorized or 403 insufficient_scope) on failure.
 */
export async function authenticateScopedApiRequest(
  request: Request,
  requiredScopes: ApiScope[] = []
): Promise<ScopedTokenPayload> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HttpError(
      401,
      "unauthorized",
      "Missing or invalid Bearer authorization header"
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new HttpError(401, "unauthorized", "Missing Bearer token");
  }

  const result = await verifyScopedApiToken(token, requiredScopes);
  if (!result.valid) {
    if (result.reason === "insufficient_scope") {
      throw new HttpError(
        403,
        "insufficient_scope",
        `Token lacks required scope(s): ${requiredScopes.join(", ")}`
      );
    }
    if (result.reason === "token_expired") {
      throw new HttpError(401, "token_expired", "API token has expired");
    }
    throw new HttpError(401, "invalid_token", "API token is invalid or malformed");
  }

  return result.payload;
}
