import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres instance.",
  );
}

// Reuse a single postgres.js client across hot-reloads in dev so we don't
// exhaust connections. In prod each serverless instance gets its own.
const globalForDb = globalThis as unknown as { _pg?: ReturnType<typeof postgres> };

const client =
  globalForDb._pg ??
  postgres(connectionString, {
    // headroom for the live submit burst at the operating target (ADR 0018);
    // inserts are small and fast, so ~20 connections is plenty single-instance.
    max: process.env.NODE_ENV === "production" ? 20 : 2,
    prepare: false, // friendlier to poolers (pgbouncer / supabase / neon)
  });

if (process.env.NODE_ENV !== "production") globalForDb._pg = client;

export const db = drizzle(client, { schema });
export { schema };
