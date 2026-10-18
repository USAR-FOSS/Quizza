import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

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

// A successful Next build can still emit the unexpanded Tailwind directives
// when the Webpack PostCSS plugin is missing. Fail before promoting that build.
const cssDir = ".next/static/css";
const css = readdirSync(cssDir)
  .filter((file) => file.endsWith(".css"))
  .map((file) => readFileSync(`${cssDir}/${file}`, "utf8"))
  .join("\n");
if (!css.includes(".bg-paper{") || !css.includes(".flex{")) {
  throw new Error("Tailwind utilities are missing from the production CSS build.");
}
