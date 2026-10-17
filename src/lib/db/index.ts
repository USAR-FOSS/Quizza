import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres instance.",
  );
}

// Reuse one postgres.js client per warm runtime so hot reloads and concurrent
// requests do not create a new pool. Each serverless instance still owns its
// own bounded pool, so the deployment must use a pooled DATABASE_URL.
const globalForDb = globalThis as unknown as { _pg?: ReturnType<typeof postgres> };

const configuredPoolMax = Number(process.env.DB_POOL_MAX);
const defaultPoolMax = process.env.VERCEL
  ? 5
  : process.env.NODE_ENV === "production"
    ? 20
    : 2;
const poolMax =
  Number.isInteger(configuredPoolMax) && configuredPoolMax > 0
    ? configuredPoolMax
    : defaultPoolMax;

const client =
  globalForDb._pg ??
  postgres(connectionString, {
    max: poolMax,
    prepare: false, // friendlier to poolers (pgbouncer / supabase / neon)
  });

globalForDb._pg = client;

export const db = drizzle(client, { schema });
export { schema };
