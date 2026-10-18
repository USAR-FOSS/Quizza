import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "dotenv";

/**
 * Applies generated SQL migrations in ./drizzle to the database.
 * Existing process environment values take precedence over local env files.
 */
config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = postgres(url, { max: 1 });

function withDrizzleTransactionSupport(tx: postgres.TransactionSql): postgres.TransactionSql {
  Object.assign(tx, {
    options: sql.options,
    begin: (callback: (nested: typeof tx) => Promise<unknown>) =>
      tx.savepoint((nested) => callback(withDrizzleTransactionSupport(nested))),
  });
  return tx;
}

// Serialize deploy-time migrators and keep the journal check and schema
// changes in one transaction. Transaction-level locks work with Neon poolers.
await sql.begin(async (tx) => {
  await tx`select pg_advisory_xact_lock(174923, 1)`;
  // Drizzle expects root-client parser options and `begin`; postgres-js
  // transactions expose savepoints instead, so map nested Drizzle txs to them.
  await migrate(
    drizzle(withDrizzleTransactionSupport(tx) as unknown as ReturnType<typeof postgres>),
    { migrationsFolder: "./drizzle" },
  );
});
await sql.end();

console.log("migrations applied");
