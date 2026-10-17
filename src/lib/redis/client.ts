import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

type RedisGlobals = typeof globalThis & {
  quizzaRedisPublisher?: RedisClient;
  quizzaRedisPublisherPromise?: Promise<RedisClient>;
  quizzaRedisSubscriber?: RedisClient;
  quizzaRedisSubscriberPromise?: Promise<RedisClient>;
  quizzaRedisReconnectListeners?: Set<() => void>;
};

const globalRedis = globalThis as RedisGlobals;
const reconnectListeners = (globalRedis.quizzaRedisReconnectListeners ??= new Set());

/** Close open SSE streams when Pub/Sub may have missed messages. */
export function onRedisSubscriberReconnect(listener: () => void): () => void {
  if (!usesRedisRealtime()) return () => {};
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

/** The memory adapter remains useful for local UI work and unit tests only. */
export function usesRedisRealtime(): boolean {
  const driver =
    process.env.REALTIME_DRIVER ??
    (process.env.NODE_ENV === "production" ? "redis" : "memory");
  if (process.env.NODE_ENV === "production" && driver !== "redis") {
    throw new Error(
      "Production requires REALTIME_DRIVER=redis; the in-process realtime adapter is not supported.",
    );
  }
  return driver === "redis";
}

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is required when REALTIME_DRIVER=redis. Configure a standard Redis connection URL.",
    );
  }
  return url;
}

function attachDiagnostics(client: RedisClient, label: string): RedisClient {
  client.on("error", (error) => {
    console.error(`[realtime] redis ${label} error`, {
      name: error instanceof Error ? error.name : "RedisError",
      message: error instanceof Error ? error.message : String(error),
    });
  });
  client.on("reconnecting", () => {
    console.warn(`[realtime] redis ${label} reconnecting`);
    if (label === "subscriber") {
      for (const listener of reconnectListeners) listener();
    }
  });
  client.on("ready", () => {
    console.info(`[realtime] redis ${label} ready`);
  });
  return client;
}

async function connect(client: RedisClient): Promise<RedisClient> {
  if (!client.isOpen) await client.connect();
  return client;
}

/** A normal command client, also used for publishing. */
export function getRedisPublisher(): Promise<RedisClient> {
  if (!usesRedisRealtime()) {
    return Promise.reject(new Error("Redis realtime driver is disabled"));
  }
  if (!globalRedis.quizzaRedisPublisherPromise) {
    const client = attachDiagnostics(
      createClient({ url: redisUrl() }),
      "publisher",
    );
    globalRedis.quizzaRedisPublisher = client;
    globalRedis.quizzaRedisPublisherPromise = connect(client).catch((error) => {
      globalRedis.quizzaRedisPublisherPromise = undefined;
      globalRedis.quizzaRedisPublisher = undefined;
      throw error;
    });
  }
  return globalRedis.quizzaRedisPublisherPromise;
}

/** A dedicated subscriber client because Redis puts subscribed sockets in a special mode. */
export async function getRedisSubscriber(): Promise<RedisClient> {
  if (!usesRedisRealtime()) {
    throw new Error("Redis realtime driver is disabled");
  }
  if (!globalRedis.quizzaRedisSubscriberPromise) {
    const publisher = await getRedisPublisher();
    const client = attachDiagnostics(publisher.duplicate(), "subscriber");
    globalRedis.quizzaRedisSubscriber = client;
    globalRedis.quizzaRedisSubscriberPromise = connect(client).catch((error) => {
      globalRedis.quizzaRedisSubscriberPromise = undefined;
      globalRedis.quizzaRedisSubscriber = undefined;
      throw error;
    });
  }
  return globalRedis.quizzaRedisSubscriberPromise;
}

/** Test-only cleanup hook; production callers should keep clients warm. */
export async function closeRedisClients(): Promise<void> {
  const clients = [
    globalRedis.quizzaRedisSubscriber,
    globalRedis.quizzaRedisPublisher,
  ];
  globalRedis.quizzaRedisSubscriber = undefined;
  globalRedis.quizzaRedisSubscriberPromise = undefined;
  globalRedis.quizzaRedisPublisher = undefined;
  globalRedis.quizzaRedisPublisherPromise = undefined;
  await Promise.all(
    clients.filter((client) => client?.isOpen).map((client) => client!.quit()),
  );
}
