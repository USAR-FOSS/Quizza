import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to migrate Production before deployment.");
  }
  console.log("Applying pending Production database migrations...");
  run("pnpm", ["db:migrate"]);
} else {
  console.log("Skipping database migrations outside Vercel Production.");
}

run("pnpm", ["exec", "next", "build", "--webpack"]);
