# Contributing to Quizza

Open Source Week issues and pull requests go to
[USAR-FOSS/Quizza](https://github.com/USAR-FOSS/Quizza). Fork the repository,
create a branch in your fork, and open your pull request against upstream `main`.
Claim an issue with a short approach before starting. Contact
siddharthb@fossunited.org if you need help choosing a task.

## Start here

Follow the [README setup](README.md#local-development): Node 24, pnpm 12.4.1,
Postgres, and `.env.local`. Email/password accounts work without OIDC. Redis and
QStash are unnecessary for the default local development mode. Run `/demo`,
then create an account and a small live quiz.

Read [AGENTS.md](AGENTS.md). Before changing Next.js code, read the relevant
installed guide under `node_modules/next/dist/docs/`; this version has breaking
changes. Avoid copying examples for older versions.

## Choose a contribution

| Level | Good scope | Expected evidence |
| --- | --- | --- |
| Good first | One empty state, keyboard interaction, docs fix, or agreed theme | Reproduction or screenshots; keyboard check |
| Intermediate | Question duplication, option ordering, QR joining, upload cleanup | Manual flow and focused regression coverage |
| Complex | Immutable session snapshots, scheduling, concurrency | Agreed design, migrations and failure behavior |
| Security | Auth, tokens, rate limits, uploads | Private report for vulnerabilities; regression proving the boundary |
| Docs | Self-hosting, player guides, API examples | Execute the commands or requests documented |

Claim one task with a short approach before working. Keep changes small enough
to review. Do not include build output, secrets, unrelated formatting, or
planning/backlog documents in a PR.

## Theme contributions

Agree on a distinct palette first. Theme keys live in `src/lib/quiz-constants.ts`
(`THEMES`), room colors in `src/components/live/room-theme.tsx`, and global tokens
in `src/app/globals.css`. Keep Tailwind utility names literal so the build detects
them. Preserve existing keys stored in quiz records.

1. Add one key, readable name, and picker swatch.
2. Define accent, paper, and surface colors with readable text and visible focus.
   Check WCAG AA text contrast using a contrast checker.
3. Check the picker, preview, host lobby, player question, reveal, and results
   on desktop and mobile. Distinguish answer states with text or icons too.
4. Attach screenshots and record keyboard and reduced-motion checks. Keep
   scoring and unrelated palettes unchanged.

## Validate a change

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Tests use mocks and need no database. Build requires a `DATABASE_URL`; fonts
are bundled locally. Outside Vercel Production it does not migrate the database.
Do not set `VERCEL_ENV=production` for routine build checks: it runs migrations.

For behavior changes, reproduce the flow in separate host and player browser
profiles. For realtime changes, use the two-instance check in
[the runbook](docs/runbooks/realtime.md) with a test database and throwaway rooms.
Add tests for logic and authorization changes; screenshots and manual checks
are enough for simple visual changes.

Schema changes need `pnpm db:generate`, checked-in SQL and metadata, and a fresh
migration check. Never run `db:push` against shared or production databases.

## Pull requests

Describe the problem, resulting behavior, and validation. Note migrations,
configuration changes, and limitations. Use plain language, no emojis or em
dashes in code, comments, docs, or commit messages. Preserve attribution; do not
add an automated co-author trailer. Follow our [Code of Conduct](CODE_OF_CONDUCT.md).

Contributions use the repository's [Apache-2.0 license](LICENSE). Submit only
work you have the right to contribute and retain third-party license notices.
