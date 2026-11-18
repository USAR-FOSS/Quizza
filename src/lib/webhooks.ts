import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export type SessionWebhookEventType =
  | "session.created"
  | "session.started"
  | "session.ended"
  | "session.question_revealed";

export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  event: SessionWebhookEventType | string;
  timestamp: number; // Unix timestamp in seconds
  apiVersion: "v1";
  data: T;
}

export interface WebhookSignatureResult {
  signature: string;
  timestamp: number;
}

export interface VerifyWebhookOptions {
  payload: string;
  signature: string;
  timestamp: number | string;
  secret: string;
  toleranceSec?: number; // default: 300 (5 minutes)
  nowSec?: number;
}

export interface WebhookDeliveryOptions {
  url: string;
  secret: string;
  event: WebhookEvent;
  maxRetries?: number; // default: 3
  backoffMs?: number[]; // default: [1000, 5000, 15000]
  timeoutMs?: number; // default: 5000
  fetchFn?: typeof fetch;
  sleeper?: (ms: number) => Promise<void>;
  allowPrivateNetworks?: boolean; // default: false
}

export interface WebhookDeliveryAttempt {
  attempt: number;
  timestamp: number;
  statusCode?: number;
  error?: string;
  durationMs: number;
}

export interface WebhookDeliveryResult {
  success: boolean;
  attempts: WebhookDeliveryAttempt[];
  totalAttempts: number;
  finalStatusCode?: number;
  lastError?: string;
}

export const DEFAULT_BACKOFF_MS = [1000, 5000, 15000];
export const DEFAULT_TOLERANCE_SEC = 300; // 5 minutes
export const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Validates a destination URL to prevent Server-Side Request Forgery (SSRF).
 * Blocks localhost, private subnets (RFC 1918), link-local cloud metadata endpoints (169.254.x.x),
 * and non-HTTP/HTTPS protocols.
 */
export function isSafeWebhookUrl(urlStr: string, allowPrivate = false): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    if (allowPrivate) return true;

    const hostname = parsed.hostname.toLowerCase();

    // Check for loopback and local hostnames
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0"
    ) {
      return false;
    }

    // Check IPv4 ranges
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const a = Number(match[1]);
      const b = Number(match[2]);
      if (a === 127) return false; // 127.0.0.0/8 loopback
      if (a === 10) return false; // 10.0.0.0/8 private
      if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 private
      if (a === 192 && b === 168) return false; // 192.168.0.0/16 private
      if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local (cloud metadata)
      if (a === 0) return false; // 0.0.0.0/8
    }

    // Check IPv6 ranges
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      const bareIpv6 = hostname.slice(1, -1).toLowerCase();
      if (bareIpv6 === "::1") return false;
      if (
        bareIpv6.startsWith("fe80:") ||
        bareIpv6.startsWith("fc00:") ||
        bareIpv6.startsWith("fd")
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Computes an HMAC-SHA256 signature over `<timestamp>.<payload>`.
 * Returns the hex signature and timestamp in seconds.
 */
export function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp?: number
): WebhookSignatureResult {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const dataToSign = `${ts}.${payload}`;
  const signature = createHmac("sha256", secret).update(dataToSign).digest("hex");
  return { signature, timestamp: ts };
}

/**
 * Verifies an incoming webhook HMAC-SHA256 signature with replay protection.
 * - Enforces timestamp drift window within ±toleranceSec (default: 300 seconds / 5 minutes).
 * - Utilizes timing-safe string comparison to protect against timing attacks.
 */
export function verifyWebhookSignature({
  payload,
  signature,
  timestamp,
  secret,
  toleranceSec = DEFAULT_TOLERANCE_SEC,
  nowSec,
}: VerifyWebhookOptions): { valid: boolean; reason?: string } {
  const tsNum = typeof timestamp === "string" ? parseInt(timestamp, 10) : timestamp;
  if (Number.isNaN(tsNum) || !Number.isFinite(tsNum)) {
    return { valid: false, reason: "invalid_timestamp" };
  }

  const currentSec = nowSec ?? Math.floor(Date.now() / 1000);
  const drift = Math.abs(currentSec - tsNum);
  if (drift > toleranceSec) {
    return { valid: false, reason: "timestamp_expired" };
  }

  const expectedData = `${tsNum}.${payload}`;
  const expectedSig = createHmac("sha256", secret).update(expectedData).digest("hex");

  const cleanSig = signature.trim().toLowerCase().replace(/^sha256=/, "");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  const providedBuf = Buffer.from(cleanSig, "utf8");

  if (expectedBuf.length !== providedBuf.length) {
    return { valid: false, reason: "signature_mismatch" };
  }

  const isValid = timingSafeEqual(expectedBuf, providedBuf);
  return isValid ? { valid: true } : { valid: false, reason: "signature_mismatch" };
}

/**
 * Factory for creating minimal, privacy-conscious session webhook events.
 * Strips participant personal identifiers and raw question answers.
 */
export function createSessionWebhookEvent(
  event: SessionWebhookEventType,
  session: {
    id: string;
    quizId: string;
    mode: string;
    status: string;
    joinCode?: string | null;
    currentQuestionId?: string | null;
    revealed?: boolean;
    startedAt?: Date | string | null;
    endedAt?: Date | string | null;
  },
  extra?: Record<string, unknown>
): WebhookEvent {
  return {
    id: randomUUID(),
    event,
    timestamp: Math.floor(Date.now() / 1000),
    apiVersion: "v1",
    data: {
      sessionId: session.id,
      quizId: session.quizId,
      mode: session.mode,
      status: session.status,
      joinCode: session.joinCode ?? null,
      currentQuestionId: session.currentQuestionId ?? null,
      revealed: Boolean(session.revealed),
      startedAt:
        session.startedAt instanceof Date
          ? session.startedAt.toISOString()
          : session.startedAt ?? null,
      endedAt:
        session.endedAt instanceof Date
          ? session.endedAt.toISOString()
          : session.endedAt ?? null,
      ...extra,
    },
  };
}

/**
 * Dispatches a webhook payload with HMAC-SHA256 headers and exponential backoff retries.
 * Retries on network errors or non-2xx HTTP responses.
 */
export async function deliverWebhook({
  url,
  secret,
  event,
  maxRetries = 3,
  backoffMs = DEFAULT_BACKOFF_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchFn = globalThis.fetch,
  sleeper = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  allowPrivateNetworks = false,
}: WebhookDeliveryOptions): Promise<WebhookDeliveryResult> {
  if (!isSafeWebhookUrl(url, allowPrivateNetworks)) {
    return {
      success: false,
      attempts: [],
      totalAttempts: 0,
      lastError: "unsafe_url_destination",
    };
  }

  const payloadString = JSON.stringify(event);
  const { signature, timestamp } = signWebhookPayload(payloadString, secret);

  const attempts: WebhookDeliveryAttempt[] = [];
  const maxAttempts = Math.min(maxRetries + 1, backoffMs.length + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let statusCode: number | undefined;
    let errorMessage: string | undefined;
    let isSuccess = false;

    try {
      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Quizza-Webhooks/1.0",
          "X-Quizza-Signature": signature,
          "X-Quizza-Timestamp": String(timestamp),
          "X-Quizza-Event": event.event,
          "X-Quizza-Delivery-Id": event.id,
        },
        body: payloadString,
        signal: controller.signal,
      });

      statusCode = response.status;
      if (response.ok) {
        isSuccess = true;
      } else {
        errorMessage = `HTTP error ${response.status}: ${response.statusText}`;
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        errorMessage = err.name === "AbortError" ? "Request timeout" : err.message;
      } else {
        errorMessage = String(err);
      }
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - startTime;
    attempts.push({
      attempt,
      timestamp: startTime,
      statusCode,
      error: errorMessage,
      durationMs,
    });

    if (isSuccess) {
      return {
        success: true,
        attempts,
        totalAttempts: attempt,
        finalStatusCode: statusCode,
      };
    }

    if (attempt < maxAttempts) {
      const delay = backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1];
      await sleeper(delay);
    }
  }

  return {
    success: false,
    attempts,
    totalAttempts: attempts.length,
    finalStatusCode: attempts[attempts.length - 1]?.statusCode,
    lastError: attempts[attempts.length - 1]?.error,
  };
}
