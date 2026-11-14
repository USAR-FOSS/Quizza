# Production deployment

Quizza's production live mode requires four services: the Next.js application,
pooled Postgres, standard-protocol Redis, and QStash. Postgres is authoritative;
Redis carries ephemeral fan-out and counters; QStash owns durable question
deadlines.

## Provisioning

1. Create a Vercel project from the repository.
2. Add a Redis Cloud integration from the Vercel Marketplace. Copy its standard
   TLS `REDIS_URL`; do not use an HTTP-only Redis REST URL for Pub/Sub.
3. Create a QStash project and keep its token plus current and next signing keys.
4. Configure a pooled Postgres URL for `DATABASE_URL`. Keep a direct migration
   URL separately if the provider recommends one.
5. Choose one canonical production domain and set `APP_URL` to it without a
   trailing slash.

## Vercel environment variables

Set these for both Preview and Production, with separate credentials:

```text
DATABASE_URL
AUTH_SECRET
REDIS_URL
REALTIME_DRIVER=redis
APP_URL
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY
INTERNAL_HEALTH_SECRET
DB_POOL_MAX=5
```

Optional OIDC variables remain documented in `.env.example`. QStash must be able
to reach `${APP_URL}/api/internal/realtime/reveal`; do not use a private or
short-lived preview hostname for a long-running event.

## Deployment order

Vercel's Production build automatically applies pending migrations before
`next build`. This runs only when `VERCEL_ENV=production`; Preview and local
builds never migrate a database. Configure the Production `DATABASE_URL` before
the first deploy. If a migration fails, the build fails and the deployment is
not promoted.

The migration runner serializes deploys with a Postgres transaction-level
advisory lock and applies migrations transactionally. Keep migrations compatible
with the currently serving app where possible; defer destructive schema changes
until old deployments are no longer serving traffic.

Preview builds need a syntactically valid `DATABASE_URL` because server modules
validate its presence during compilation; they do not apply migrations. A dummy
local URL is sufficient for a build-only check, but not for serving database routes.
If you want database-backed Preview tests, configure a separate Preview database
and credentials; do not point Preview deployments at Production.

Run lint, typecheck, tests, production build, and the two-instance smoke test
from [the scale plan](realtime-scale-plan.md) before merging when practical.
After deploy, run a private live room through start, answer, automatic reveal,
reconnect, next, and end. Monitor Redis, QStash, Postgres, and SSE metrics.

Before promotion, exercise both modes with each answer policy (after each,
at end, never) and each leaderboard policy (after each live round, at end,
hidden). For a live game, verify that standings do not leak while a question
is open; test a Shield against an Attack, Safety net on a miss, and a repeated
charge. Scheduled mode offers only Double up and Safety net. An Attack settles
at the shared reveal; a reconnect must show the same score and outcome.

For the repeatable 50/200/1,000-player checks, use the commands in
[the realtime runbook](runbooks/realtime.md#load-test). Keep each run on a fresh
room; the harness ends the room after its fifth question.

The private health check is `GET /api/internal/health` with the
`x-internal-health-secret` header. It returns only component status and is not
listed in OpenAPI.

Never run `db:push` against Production. Production migrations run as part of the
Vercel Production build; Preview builds are explicitly excluded.

## Local development

`docker compose --env-file .env.local up --build` starts the app, Postgres, and
Redis. Generate `AUTH_SECRET` with `openssl rand -hex 32` first. Compose requires
this value and passes the optional OIDC and QStash settings to the app.

For development outside Docker, `.env.example` defaults to
`REALTIME_DRIVER=memory`. To test Redis fan-out from the host,
run a separate Redis reachable from the host (Compose does not publish its Redis
port), then set `REALTIME_DRIVER=redis` and its `REDIS_URL`. To test
durable callbacks, provide a public `APP_URL` through a development tunnel and
QStash credentials. Production rejects the memory driver. `pnpm db:migrate`
loads `.env.local` and `.env` for local use; an explicitly supplied process
`DATABASE_URL` takes precedence, as it does during Vercel Production builds.
`pnpm dev` applies pending migrations before starting Next.js; the Production
Vercel build applies them before compiling. Both paths stop if a migration fails.

## Rollback

Pause new live rooms before reverting. The old build has no QStash callback
route, so a direct rollback while delayed reveals are pending would strand
those rooms. Keep this build serving the callback until all active questions
and QStash retries drain, or deploy a rollback build that retains the signed
callback route. Then revert the app and keep Redis/QStash available until no
delayed messages remain.

If Redis is unavailable, Postgres answer/reveal state remains authoritative and
SSE clients recover on reconnect. If QStash is unavailable, a new live round is
not started because its durable reveal cannot be scheduled.

## Backup and recovery

For database disaster recovery procedures, isolated restore rehearsal commands,
and verification of database-stored uploads and migration state, see the
[backup and restore runbook](runbooks/backup-restore.md).

