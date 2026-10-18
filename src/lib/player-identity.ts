import { api, ApiClientError } from "@/lib/api-client";

export type PlayerIdentity = {
  clientToken: string;
  participantId: string;
  nickname: string;
  teamName?: string | null;
  avatarColor: string;
  avatarUrl?: string | null;
  photoWarning?: string;
};

const key = (sessionId: string) => `quizza:player:${sessionId}`;

export function savePlayerIdentity(sessionId: string, identity: PlayerIdentity) {
  localStorage.setItem(key(sessionId), JSON.stringify(identity));
}

export async function restorePlayerIdentity(code: string, sessionId: string) {
  const currentKey = key(sessionId);
  const legacyKey = `quizza:player:${code}`;
  const raw = localStorage.getItem(currentKey) ?? localStorage.getItem(legacyKey);
  if (!raw) return null;
  let identity: PlayerIdentity;
  try {
    identity = JSON.parse(raw);
    if (!identity?.clientToken || !identity?.participantId) throw new Error("Invalid identity");
  } catch {
    localStorage.removeItem(currentKey);
    localStorage.removeItem(legacyKey);
    return null;
  }
  try {
    // A room code may be reused. Validate both modern and legacy identities
    // against this session before letting a browser resume an attempt.
    await api.getProgress(code, identity.clientToken);
  } catch (error) {
    if (error instanceof ApiClientError && ["invalid_token", "signin_required"].includes(error.code)) {
      localStorage.removeItem(currentKey);
      localStorage.removeItem(legacyKey);
      return null;
    }
    throw error;
  }
  savePlayerIdentity(sessionId, identity);
  localStorage.removeItem(legacyKey);
  return identity;
}
