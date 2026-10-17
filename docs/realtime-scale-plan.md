# Realtime scale-out implementation plan

Status: ready to implement. Work through the numbered steps in order. Do not
combine steps, and do not start the next step until the current step's checks
pass.

Current implementation status: sections 1–9 are implemented in the current
worktree. Section 10 has an opt-in two-process smoke runner, a k6 SSE load
harness, and a paced participant preparation script. Its real two-process run, Redis restart test,
and 50→1,000-player Preview runs remain open until Redis/QStash resources and
a prepared Preview room are available. Sections 11–13 remain the operational
handoff and acceptance checklist.

## 1. Target architecture and non-negotiable rules

The production target is Vercel plus managed Postgres, Redis, and QStash:

```mermaid
flowchart LR
  browser[Host and player browsers]
  app[Vercel Next.js functions]
  pg[(Postgres: source of truth)]
  redis[(Redis: fan-out, counters, rate limits)]
  qstash[QStash: durable delayed callbacks]

  browser -->|REST actions| app
  browser <-->|SSE, reconnectable| app
  app <-->|durable reads and writes| pg
  app <-->|publish and subscribe| redis
  app -->|schedule reveal| qstash
  qstash -->|signed reveal callback| app
```

Rules Luna must preserve:

1. Postgres remains the source of truth. Redis must never hold the only copy of
   quiz, session, answer, score, reveal, or participant state.
2. Redis Pub/Sub is a wake-up/fan-out mechanism. It is at-most-once and has no
   replay. Every SSE connection must therefore begin with a fresh Postgres
   snapshot, and reconnecting must repair missed messages.
3. QStash, not `setTimeout`, owns automatic reveal deadlines in production.
4. Every QStash callback is authenticated and idempotent. Duplicate, late, or
   stale callbacks return success without changing the wrong round.
5. Never publish host tokens, player tokens, correct answers before the reveal,
   email addresses, or other credentials into a player-facing payload.
6. Keep answer fan-out small. Do not rebuild or broadcast a complete snapshot
   for every answer or join.
7. Use the Node.js runtime for Redis TCP subscriptions and SSE. Do not change
   these routes to the Edge runtime.
8. Before changing a Next.js route, read the applicable local guide under
   `node_modules/next/dist/docs/`, as required by `AGENTS.md`.

Redis Pub/Sub alone is intentionally not the whole design. Pub/Sub distributes
events across instances, while QStash supplies durable timers and Postgres
supplies recovery after a missed event.

## 2. Provider setup and configuration contract

### Provider choices

- Provision **Redis Cloud through the Vercel Marketplace**, in the same region
  as the Vercel functions and Postgres. It exposes the standard Redis protocol
  needed by `node-redis` Pub/Sub. Do not use an HTTP-only Redis client for the
  subscriber connection.
- Provision **Upstash QStash** for delayed, retried HTTP delivery.
- Use a pooled Postgres connection string for `DATABASE_URL`.

### Environment variables

Add these names to `.env.example`, Vercel Preview, and Vercel Production:

```dotenv
# Standard TLS Redis URL supplied by the Redis/Vercel integration.
REDIS_URL="rediss://default:password@host:port"

# Canonical public origin, with no trailing slash. QStash calls this origin.
APP_URL="https://quiz.example.com"

# QStash publisher and callback verification credentials.
QSTASH_TOKEN=""
QSTASH_CURRENT_SIGNING_KEY=""
QSTASH_NEXT_SIGNING_KEY=""

# Keep a small per-function DB pool when deployed serverlessly.
DB_POOL_MAX="5"
```

Use separate Redis and QStash credentials for Preview and Production. Preview's
`APP_URL` must point at its stable preview/custom domain; do not schedule jobs
against a transient deployment URL that will disappear.

### Dependencies

Install exactly:

```bash
pnpm add redis @upstash/qstash
```

Do not add `@upstash/redis`; this plan needs a long-lived standard Redis Pub/Sub
connection, not only REST commands.

### Local development

Add a Redis 7 service and named volume to `docker-compose.yml`, add a health
check, make `app` depend on it, and pass `REDIS_URL=redis://redis:6379` to the
app. QStash cannot call localhost, so local development needs one of these two
explicit modes:

- `REALTIME_DRIVER=memory`: in-process bus and timer fallback for ordinary local
  UI work only.
- `REALTIME_DRIVER=redis`: Redis bus, with a tunnel/public dev URL and QStash for
  end-to-end scheduler testing.

Production must reject `REALTIME_DRIVER=memory`. Default to `redis` when
`NODE_ENV=production`, and to `memory` otherwise.

Checks for this step:

- `pnpm install --frozen-lockfile`
- `docker compose config`
- `pnpm typecheck`

Suggested commit: `chore: configure redis and qstash infrastructure`

## 3. Replace the in-process bus with a Redis-backed adapter

### Files

- Add `src/lib/redis/client.ts`.
- Add `src/lib/realtime/channels.ts`.
- Refactor `src/lib/realtime/bus.ts`.
- Update `src/lib/realtime/events.ts`.
- Add `src/lib/realtime/bus.test.ts`.

### Redis clients

`src/lib/redis/client.ts` must expose lazy singleton accessors for:

- one command/publisher client; and
- one duplicated subscriber client.

Both clients must use `REDIS_URL`, attach `error`, `reconnecting`, and `ready`
listeners, and reuse instances through `globalThis` in development and warm
production instances. Never log the Redis URL or credentials. Do not connect at
module import time; connect on first use and share the in-flight connection
promise so concurrent requests do not open duplicate sockets.

### Channel names

Centralize and validate channel construction in `channels.ts`:

```text
quizza:v1:session:<session UUID>:state
quizza:v1:session:<session UUID>:host
quizza:v1:session:<session UUID>:roster
quizza:v1:session:<session UUID>:presence
```

Only accept a UUID obtained from Postgres. Never place room codes, host tokens,
or player tokens in channel names.

### Event envelope

Wrap every event in a versioned envelope:

```ts
type RealtimeEnvelope = {
  version: 1;
  eventId: string;
  sessionId: string;
  emittedAt: string;
  event: LiveEvent;
};
```

Generate `eventId` with `crypto.randomUUID()`. Validate decoded Redis messages;
log and ignore malformed or wrong-version messages.

Extend `LiveEvent` with two small events:

```ts
type LiveEvent =
  | { kind: "state"; player: PlayerSnapshot; host: HostSnapshot }
  | { kind: "tick"; answeredCount: number }
  | { kind: "participant_changed"; participant: LiveLeaderboardEntry; joined: boolean };
```

`state` uses the state channel, `tick` uses the host channel, and
`participant_changed` uses the roster channel.

### Subscription lifecycle

Keep a local `Map<channel, Set<handler>>` in each warm app instance:

- first local listener for a channel calls Redis `SUBSCRIBE` once;
- later local listeners only join the local set;
- removing the last listener calls Redis `UNSUBSCRIBE`;
- serialize subscribe/unsubscribe operations per channel to prevent races;
- one Redis message is decoded once, then fanned out to local handlers;
- publishing goes through Redis only—do not also emit locally or the publishing
  instance will deliver duplicates.

Expose an async API:

```ts
publish(sessionId, event): Promise<void>
subscribe(sessionId, role, handler): Promise<() => Promise<void>>
```

A player subscribes to state and roster. A host subscribes to state, roster, and
host channels. Preserve a memory adapter with the same interface for unit tests
and local development.

### Tests

Use an injected/fake Redis client; unit tests must not require a network. Cover:

- two local handlers cause one Redis subscription;
- last cleanup unsubscribes;
- player never receives a host tick;
- publish does not double-deliver locally;
- malformed/wrong-session envelopes are ignored;
- concurrent first subscriptions do not create duplicate subscriber calls;
- memory driver retains current behavior.

Run `pnpm lint && pnpm typecheck && pnpm test`.

Suggested commit: `feat: add redis realtime backplane`

## 4. Make SSE safe on serverless instances

### Files

- Update `src/app/api/v1/sessions/[code]/stream/route.ts`.
- Update `src/lib/use-event-stream.ts` only if the existing browser reconnect
  behavior needs explicit handling.
- Add route/stream tests around cleanup and reconnect behavior.

### Route changes

1. Export `maxDuration = 300` from the stream route. This repository enables
   Next 16 `cacheComponents`, which rejects route-level `runtime` and `dynamic`
   exports; the route's database/Redis request APIs already keep it request-time
   and the default route runtime is Node.js.
2. Await Redis subscription **before** building the initial Postgres snapshot.
   Keep the existing initialization buffer so a change between subscribe and
   snapshot completion is not lost.
3. Send `retry: 1500\n\n` once when the stream opens.
4. Keep a heartbeat comment every 20–25 seconds.
   In live rooms, each heartbeat also refreshes the player's Redis presence
   lease. Leases expire after 65 seconds; active stream heartbeats prune expired
   members and publish roster removals. Lobby snapshots include only leased
   participants; scores and participant records remain in Postgres.
5. Intentionally close the stream after 270 seconds. `EventSource` will reconnect
   before Vercel's common five-minute ceiling, and the fresh snapshot repairs
   any missed Pub/Sub events.
6. Cleanup must clear heartbeat and lifetime timers, remove the request abort
   listener, and await/trigger the async unsubscribe exactly once.
7. Add `Cache-Control: no-cache, no-transform` and keep proxy buffering disabled.
8. Never send a Redis/internal error or credential to the browser. Close the
   stream and let `EventSource` reconnect.

### Client event reduction

Keep full snapshots as replacements. Merge small events as follows:

- `tick`: replace only host `answeredCount`;
- `participant_changed`: add/remove the participant from `onlineParticipants`;
  adjust the lobby count only when membership actually changes. Leaving never
  deletes the participant record or score;
- apply leave tombstones to the next full snapshot so a stale participant row
  cannot resurrect a departed lobby avatar.

Event application must be idempotent by `eventId`; retain a bounded set of the
last 100 IDs per connection, then discard old IDs.

### Acceptance tests

- Open host and two player streams through two app processes; an event published
  by either process reaches all appropriate clients.
- Host ticks never appear on a player stream.
- Killing Redis makes clients show reconnecting rather than crash.
- After Redis returns, reconnect produces the current database state.
- After the forced 270-second close, the browser reconnects without losing the
  selected/locked answer UI.
- Listener count returns to zero after every client disconnects.

Suggested commit: `feat: make live SSE reconnectable across instances`

## 5. Remove join and answer broadcast hot spots

### Files

- Refactor `src/lib/realtime/notifications.ts`.
- Update join and avatar-upload call sites in `src/lib/sessions.ts` and
  `src/app/api/v1/uploads/route.ts`.
- Update answer submission in `src/lib/sessions.ts`.
- Update relevant tests.

### Roster updates

Delete the process-local `pending` debounce for rosters. After a successful live
join/stream connect, publish `participant_changed` with `joined: true`. On
explicit leave publish `joined: false`; lease expiry handles abrupt disconnects.
After an avatar change, publish the updated participant entry. Never include
the client token.

Initial connection and reconnect still use `buildSnapshots`, so roster events
do not need persistence or replay.

### Answer counts

Do not execute a Postgres `count(*)` after every answer and do not broadcast a
full snapshot. Use one Redis counter per active question:

```text
quizza:v1:session:<session UUID>:question:<question UUID>:answers
```

- Set it to `0` with a six-hour TTL immediately before committing `start` or
  `next` for a new question.
- After a successful answer transaction, `INCR` the key, refresh its TTL, and
  publish the returned value as a host-only `tick`.
- If Redis is unavailable, the answer still succeeds because Postgres is the
  authority. Log the failure; the next host reconnect obtains the exact count
  from `buildSnapshots`.
- Never increment for rejected, duplicate, late, or invalid answers.

Setting the counter before the conditional session update is safe: if that DB
update loses a race, the unused counter is harmless and expires. The successful
control path publishes the authoritative state afterward.

Tests must prove that a 1,000-answer burst causes 1,000 tiny host-channel events,
zero player-channel answer events, and no full snapshot builds per answer.

Suggested commit: `perf: use delta events for live crowd updates`

## 6. Replace process timers with durable QStash reveals

### Files

- Add `src/lib/realtime/scheduler.ts`.
- Add `src/lib/realtime/reveal.ts`.
- Add `src/app/api/internal/realtime/reveal/route.ts`.
- Refactor `src/lib/realtime/snapshot.ts` and `src/lib/sessions.ts`.
- Add `src/lib/realtime/scheduler.test.ts` and reveal route tests.

### Scheduling contract

Define this body with zod:

```ts
{
  sessionId: string;          // UUID
  questionId: string;         // UUID
  questionStartedAt: string;  // exact ISO value written to Postgres
}
```

When `start` or `next` will open a question:

1. Choose `questionStartedAt` once in application code.
2. Calculate the absolute deadline from that timestamp and `timeLimitSec`.
3. Before committing the session update, publish a QStash message to
   `${APP_URL}/api/internal/realtime/reveal` with:
   - `notBefore: Math.ceil(deadlineMs / 1000)`;
   - five retries;
   - `retryDelay: "1000 * (1 + retried)"`;
   - a stable deduplication ID derived from session ID, question ID, and start
     timestamp, or content-based deduplication if that is what the installed SDK
     exposes.
4. Only commit the session transition after QStash accepted the message.

This ordering is deliberate. If scheduling succeeds but the database update
fails, the callback later sees a stale payload and does nothing. If scheduling
fails, the round never starts without a timer.

### Callback route

The callback must:

1. Read the raw request body before parsing it.
2. Verify `Upstash-Signature` with both QStash signing keys and the exact request
   URL.
3. Return `401` for a missing/invalid signature.
4. Validate the JSON body.
5. Atomically update the session to `revealed = true` only where all of these
   still match: session ID, mode `live`, status `active`, current question ID,
   `revealed = false`, and exact `questionStartedAt`.
6. Confirm the database-derived deadline has arrived. If a clock-skewed callback
   is early, return a retryable response with `Retry-After` for the remaining
   whole seconds.
7. If the update changed one row, build and publish the reveal snapshot.
8. If it changed zero rows because the host ended/moved the room or another
   callback won, return `204`. Duplicates are success, not errors.

Keep deadline reconciliation in `buildSnapshots` as a recovery guard, but remove
`clockGlobal`, `clocks`, and every reveal `setTimeout`. Reconciliation may
atomically reveal an overdue round and publish once; it must never arm a timer.

### Failure behavior

- Redis down at callback time: Postgres still records the reveal; QStash retries
  the non-2xx callback, and duplicate DB updates remain harmless.
- QStash duplicate: conditional update changes zero rows and returns `204`.
- Old callback after `next`: question/start timestamp mismatch makes it a no-op.
- App cold start or redeploy: scheduled QStash delivery still occurs.

Tests must cover valid signature, both signing keys, bad signature, early
delivery, duplicate delivery, stale question, stale timestamp, ended session,
concurrent callback/answer locking, Redis failure, and exactly one reveal.

Suggested commit: `feat: schedule durable live reveals with qstash`

## 7. Move rate limiting into Redis

### Files

- Refactor `src/lib/rate-limit.ts`.
- Update async callers in `src/lib/api/http.ts`, `src/lib/actions/auth.ts`, and
  `src/app/api/v1/uploads/route.ts`.
- Update every route that calls `enforceRateLimit` to await it.
- Add rate-limit tests.

Implement the current fixed-window policy as one atomic Redis Lua operation:

1. `INCR` the namespaced key.
2. Set `PEXPIRE` only when the value becomes one.
3. Return the count and `PTTL`.

Hash the identifier with SHA-256 before placing it in the key so raw IPs and
account/player identifiers are not visible in Redis. Prefix keys with
`quizza:v1:ratelimit:`. Preserve the current `{ ok, retryAfter }` interface but
make it asynchronous.

If Redis is unavailable, fall back to the current bounded in-process limiter and
emit a structured warning. This preserves availability while clearly degrading
cross-instance enforcement. Keep the fallback map cleanup.

Tests must cover the limit boundary, TTL/reset, concurrency, hashed keys,
fallback behavior, and correct HTTP `429` plus retry seconds.

Suggested commit: `feat: enforce distributed rate limits with redis`

## 8. Bound database and connection usage

### Files

- Update `src/lib/db/index.ts`.
- Update deployment documentation and `.env.example`.

Parse `DB_POOL_MAX` as a positive integer. Defaults:

- `5` when `VERCEL` is set;
- `20` for the long-running production container;
- `2` in development/test.

Keep `prepare: false`. Reuse the client on `globalThis` for all warm runtimes,
not only development. Require a provider's pooled Postgres URL on Vercel; use a
direct URL only for migrations if the database provider recommends it.

Redis subscription count should be approximately one subscriber connection per
warm app instance, not one per browser. Add a test/assertion around this property.

Suggested commit: `perf: bound serverless database connections`

## 9. Observability and safe degradation

Add structured logs with stable event names and no secrets:

- `realtime.redis.connected`, `.reconnecting`, `.error`;
- `realtime.publish.failed` with session ID and event kind;
- `realtime.sse.opened`, `.closed` with role and duration;
- `realtime.reveal.scheduled`, `.completed`, `.stale`, `.failed`;
- `ratelimit.redis_fallback`.

Add a private health endpoint, protected by a new `INTERNAL_HEALTH_SECRET`, that
checks Postgres and Redis with strict short timeouts. It must not expose URLs,
credentials, room data, or stack traces. Do not put it in the public OpenAPI
document.

Define alert conditions in the runbook:

- any sustained Redis reconnect loop;
- QStash reveal failures or callback lag over two seconds;
- Postgres pool exhaustion;
- SSE reconnect rate spike;
- event propagation p95 over one second;
- rate limiter fallback usage in production.

Suggested commit: `chore: add realtime health signals`

## 10. Automated and load validation

### Required automated checks

Run after every implementation step:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Add an opt-in integration suite using Docker Redis. It must launch two Node app
processes against the same Postgres and Redis, then prove cross-instance join,
start, answer count, reveal, next, end, disconnect cleanup, and recovery after a
Redis restart.

### Load harness

Add `scripts/load/live.js` for k6 and `pnpm test:load:live`. Parameters must come
from environment variables, not source edits. The harness should:

1. create or receive a prepared live room;
2. ramp to 50 players, then 200, then 1,000;
3. hold one SSE stream per player plus one host stream;
4. submit one answer per player within a five-second burst;
5. run at least five questions;
6. randomly disconnect/reconnect 10% of clients;
7. verify every client reaches the same phase and question;
8. record submit latency, event latency, reveal skew, reconnect recovery, error
   rate, DB connections, Redis connections/ops, and function duration/cost.

Do not claim the capacity target until a production-like Preview run meets:

- answer API error rate below 1% excluding intentional rate-limit responses;
- answer p95 below 500 ms and p99 below 1 s;
- phase-event p95 below 1 s;
- automatic reveal visible to 99% of connected clients within 2 s;
- all reconnecting clients recover the correct state within 5 s;
- no leaked Redis subscriptions after the room ends;
- Postgres and Redis remain below provider connection limits;
- no Vercel function timeout or memory error.

If Vercel cannot economically sustain 1,000 SSE streams even after these
changes, stop tuning Redis. Move browser fan-out to a managed realtime service
or run the Node SSE tier on a long-running host; keep the REST app on Vercel.

Suggested commit: `test: add multi-instance realtime load coverage`

## 11. Documentation updates required before merge

Update all of these in the same final documentation PR:

- `README.md`: stack table, setup steps, environment variables, local Redis,
  QStash/tunnel workflow, deployment summary, and roadmap checkbox.
- `.env.example`: every variable in section 2 with safe placeholders.
- `docker-compose.yml`: Redis service, health check, dependency, and env.
- `docs/decisions.md`: append a new ADR; do not rewrite old ADRs. Record Redis
  Pub/Sub + QStash + reconnectable SSE, and mark ADR 0018's single-instance
  operating choice superseded for live mode.
- `docs/sdd.md`: update C4/container, request flow, reveal sequence, deployment,
  failure modes, capacity assumptions, and Redis/QStash trust boundaries.
- `docs/gaps.md`: mark shared pub/sub, durable reveals, and distributed rate
  limits complete only after their integration tests pass; keep load capacity
  open until the load thresholds pass.
- `docs/threat-model.md`: cover Redis/QStash credential theft, forged/replayed
  callbacks, channel injection, event payload leakage, Redis outage, SSE
  exhaustion, and distributed rate-limit degradation.
- `docs/upgrade.md`: dependency/env changes, provider provisioning, deployment
  order, rollback, and confirmation that no database migration is needed unless
  implementation introduced one.
- `docs/README.md`: link the two new documents below.
- Add `docs/deployment.md`: Vercel/Redis/QStash/Postgres setup from zero.
- Add `docs/runbooks/realtime.md`: dashboards, health checks, Redis outage,
  QStash failure, stuck room, credential rotation, rollback, and load-test steps.
- Update OpenAPI descriptions only if a public endpoint or response shape
  changed. Keep `/api/internal/**` out of public OpenAPI.

Suggested commit: `docs: document scalable realtime operations`

## 12. Deployment and rollback order

Deploy in this order:

1. Provision Redis and QStash in a non-production environment.
2. Add Preview environment variables and redeploy.
3. Run all unit/integration checks and the 50-player load stage.
4. Run 200, then 1,000 players only after the prior stage passes.
5. Provision Production resources and secrets.
6. Deploy while `REALTIME_DRIVER=memory` only if running on one persistent
   instance; Vercel Production must use `redis`.
7. Smoke-test one private room: two app instances, two players, automatic
   reveal, reconnect, next, and end.
8. Open traffic gradually and watch the alerts in section 9.

Rollback needs callback compatibility: the prior build does not expose the
QStash reveal route. Pause new live rooms and wait for active questions plus
QStash retries to drain before redeploying it, or deploy a rollback build that
retains the signed reveal callback. Do not delete Redis/QStash resources until
all delayed messages have drained.

## 13. Final definition of done

The work is complete only when all of these are true:

- no production reveal depends on an in-process timer;
- no production broadcast or rate limit depends only on process memory;
- live state crosses two app instances;
- Redis loss degrades and recovers without corrupting Postgres state;
- QStash callbacks are signed, idempotent, and stale-safe;
- SSE connections rotate and reconnect within platform duration limits;
- answer and join bursts do not trigger full-room snapshot rebuilds;
- automated, multi-instance, reconnect, and load tests pass;
- documentation and runbooks match the deployed architecture;
- the capacity claim is written down only with measured results attached.
