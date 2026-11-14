# Development setup

[README](../README.md) → [Contributing](../CONTRIBUTING.md) → Development setup

This is the canonical local setup guide. For a public deployment, use
[deployment](deployment.md). For a task-specific reference, use the
[documentation map](README.md#find-the-right-reference).

## Prerequisites

- Node.js 24, also recorded in `.nvmrc` and `package.json`.
- pnpm 12.4.1, matching `packageManager`.
- PostgreSQL, locally or through a development database. The Docker example uses
  PostgreSQL 16.
- Docker is optional for local Node development and required for the full
  container path below.

Check `node --version` and `pnpm --version`. If pnpm is missing:

```bash
npm install --global pnpm@12.4.1
```

The migration runner executes TypeScript directly through Node. Do not use the
framework's lower minimum Node version as this project's requirement.

## Local setup

Contributors should first follow [fork and branch setup](../CONTRIBUTING.md#2-fork-and-run-the-app).
To run the project without preparing a contribution, clone upstream:

```bash
git clone https://github.com/USAR-FOSS/Quizza.git
cd Quizza
```

From the repository directory:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
openssl rand -hex 32
```

Paste the generated value into `AUTH_SECRET` in `.env.local`. Do not commit it.
Set `DATABASE_URL` to a development database. To start the example database,
skip this command if you already have a suitable Postgres on port 5432:

```bash
docker run --name quizza-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=quizza -p 127.0.0.1:5432:5432 -d postgres:16
```

The example `DATABASE_URL` matches that container. Keep
`REALTIME_DRIVER=memory` for normal local development. OIDC and QStash credentials
can stay empty; email/password host accounts work locally.

```bash
pnpm dev
```

This applies checked-in migrations and starts the app at
`http://localhost:3000`. If port 3000 is occupied, use `pnpm dev --port 3001`.
Stop the dev server with Ctrl-C. The database persists independently.

Do not run `db:generate` on a fresh checkout. The migration files already exist.
Never point development commands at a production database.

## First smoke check

1. Open `/demo` to try the player interface without an account.
2. Open `/login`, choose **Create account**, and register a local test host.
3. Create a quiz with a true/false question, enter a prompt, and confirm autosave.
4. Launch a live room. In a separate browser profile or private window, join with
   its code and a nickname.
5. Start the question, lock in an answer, wait for reveal, and finish the room.
6. Check results as host and player. Reload during another test run to confirm
   recovery rather than creating a second attempt.

Use fictional accounts and responses. Do not reuse real participant data for
screenshots, tests, fixtures, or issue reports.

## Docker

Copy `.env.example` to `.env.local` and generate `AUTH_SECRET` as above, then run:

```bash
docker compose --env-file .env.local up --build
```

Compose starts Postgres, Redis, a one-shot migration, and the app on port 3000.
It uses internal database and Redis addresses and passes optional OIDC/QStash
configuration from the env file. It refuses an empty `AUTH_SECRET`.

This is a production build with a localhost reveal-timer fallback for local
checks. Public hosting needs the [production setup](deployment.md), including a
reachable callback origin and QStash configuration. The container runs as a
non-root user and includes the project and bundled-font license notices.

To stop the stack while retaining its database volumes:

```bash
docker compose --env-file .env.local down
```

## Validation

| Change | Evidence |
| --- | --- |
| Application logic or authorization | Focused regressions, unit suite, typecheck, lint, production build, affected host/player flow |
| Visual or accessibility behavior | Screenshots when useful, narrow viewport, keyboard, and relevant screen-reader or reduced-motion checks |
| Realtime or scoring | Applicable reveal policies, reconnects, duplicate submissions, and the two-instance check |
| Schema | Fresh migration and existing-data upgrade checks on disposable databases |
| Docs | Valid links, accurate terminology, and execution of changed commands/examples |

Common application checks:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Unit tests use mocks and need no database. A build requires a syntactically valid
`DATABASE_URL`; outside Vercel Production it does not run migrations. Fonts are
bundled locally. Setting `VERCEL_ENV=production` runs migrations before building,
so do not set it for routine contributor checks.

For Redis, QStash, two-instance, and load checks, follow the
[realtime runbook](runbooks/realtime.md). Compose does not publish its Redis port;
a dev process on the host needs a separately reachable Redis endpoint. Do not
claim QStash delivery or production capacity from a memory-driver smoke check.

## Database changes

The authoritative schema is `src/lib/db/schema.ts`. Client-safe types live in
`src/lib/db/schema-types.ts`.

1. Agree on the data change and compatibility needs in the issue or design.
2. Update the schema and related types.
3. Run `pnpm db:generate` and review the generated SQL and metadata.
4. Apply with `pnpm db:migrate` on a disposable database and check upgrades with
   representative existing data.
5. Include SQL/metadata and update the [data dictionary](data-dictionary.md) and
   [upgrade notes](upgrade.md) when applicable.

Never use `db:push` against a shared or production database. The migration runner
loads `.env.local` and `.env`; explicitly supplied environment variables take
precedence.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| TypeScript migration cannot start | Use Node 24 and the pinned pnpm version. |
| `DATABASE_URL is not set` | Create `.env.local` in the repository root and set the variable. |
| Database connection refused | Start Postgres, verify its host/port/database, and wait for readiness. |
| Docker container name already exists | Inspect the existing `quizza-pg`; start it if it is your dev database. Do not delete it blindly. |
| Port already in use | Stop your old process or choose another dev port; check Docker separately. |
| Compose asks for `AUTH_SECRET` | Generate it in `.env.local` and pass `--env-file .env.local`. |
| Production rejects memory realtime | Use Redis for a production build, or `pnpm dev` for local memory mode. |
| FOSSClub button is missing | Optional OIDC credentials are not configured; local email/password still works. |
| Migration fails | Keep the error and inspect database/schema state before retrying; avoid `db:push` as a repair shortcut. |
| Vercel preview requests authorization | A maintainer must handle the preview permission; local checks can still be run. |

For help, include the commit, Node/pnpm versions, command, and redacted error in
[Discussions](https://github.com/USAR-FOSS/Quizza/discussions). Use the
[security policy](../SECURITY.md) for sensitive reports.
