import { getRedisPublisher, usesRedisRealtime } from "@/lib/redis/client";
import { presenceKey } from "./channels";

export const PRESENCE_TTL_MS = 65_000;

const REFRESH_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local cutoff = tonumber(ARGV[2])
local member = ARGV[3]
local ttl = tonumber(ARGV[4])
local expired = redis.call("ZRANGEBYSCORE", key, "-inf", cutoff)
for _, id in ipairs(expired) do redis.call("ZREM", key, id) end
local added = 0
if member ~= "" then
  if not redis.call("ZSCORE", key, member) then added = 1 end
  redis.call("ZADD", key, now, member)
end
redis.call("EXPIRE", key, ttl)
return { added, expired }
`;

export async function refreshPresence(
  sessionId: string,
  participantId?: string,
): Promise<{ joined: boolean; expired: string[] }> {
  if (!usesRedisRealtime()) return { joined: Boolean(participantId), expired: [] };
  const now = Date.now();
  const redis = await getRedisPublisher();
  const result = (await redis.sendCommand([
    "EVAL",
    REFRESH_SCRIPT,
    "1",
    presenceKey(sessionId),
    String(now),
    String(now - PRESENCE_TTL_MS),
    participantId ?? "",
    "120",
  ])) as [number | string, string[]];
  return {
    joined: Number(result[0]) === 1,
    expired: (result[1] ?? []).filter((id) => id !== participantId),
  };
}

export async function removePresence(
  sessionId: string,
  participantId: string,
): Promise<void> {
  if (!usesRedisRealtime()) return;
  const redis = await getRedisPublisher();
  await redis.sendCommand(["ZREM", presenceKey(sessionId), participantId]);
}

export async function onlineParticipantIds(sessionId: string): Promise<Set<string> | null> {
  if (!usesRedisRealtime()) return null;
  const redis = await getRedisPublisher();
  const ids = (await redis.sendCommand([
    "ZRANGEBYSCORE",
    presenceKey(sessionId),
    String(Date.now() - PRESENCE_TTL_MS),
    "+inf",
  ])) as string[];
  return new Set(ids);
}
