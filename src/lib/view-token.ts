import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed per-question view token. Issued when a scheduled-mode player opens a
 * question, so the server (not the client) anchors the response-time clock. The
 * token carries a server timestamp; on submit the server computes the elapsed
 * time from it, which makes the speed bonus non-gameable in self-paced play.
 */
const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signViewToken(
  sessionId: string,
  questionId: string,
  participantId: string,
  issuedAt: number = Date.now(),
): string {
  const payload = `${sessionId}.${questionId}.${participantId}.${issuedAt}`;
  const mac = createHmac("sha256", SECRET).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(mac)}`;
}

/** Returns the server-issued timestamp if the token is valid for this view. */
export function verifyViewToken(
  token: string,
  sessionId: string,
  questionId: string,
  participantId: string,
): number | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  let payload: string;
  try {
    payload = Buffer.from(parts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  } catch {
    return null;
  }
  const expectedMac = createHmac("sha256", SECRET).update(payload).digest();
  let givenMac: Buffer;
  try {
    givenMac = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
  if (givenMac.length !== expectedMac.length || !timingSafeEqual(givenMac, expectedMac)) {
    return null;
  }
  const [sid, qid, pid, t] = payload.split(".");
  if (sid !== sessionId || qid !== questionId || pid !== participantId) return null;
  const issuedAt = Number(t);
  return Number.isFinite(issuedAt) ? issuedAt : null;
}
