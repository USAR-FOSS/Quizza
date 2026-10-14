import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies the generated SQL migrations in ./drizzle to the database.
 * Run with: pnpm db:migrate  (loads .env.local via node --env-file).
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = postgres(url, { max: 1 });

await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();

console.log("migrations applied");
