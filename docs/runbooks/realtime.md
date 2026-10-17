# Realtime operations runbook

## Healthy room checklist

- Redis has one subscriber connection per warm app instance, not per browser.
- SSE streams send heartbeats and reconnect before the platform duration limit.
- QStash reveal callbacks complete close to the question deadline.
- Postgres connections stay below the provider pool limit.
- No `realtime.redis_fallback` or sustained reconnect errors appear in logs.

## Redis outage

1. Confirm the Redis provider status and `REDIS_URL`/TLS configuration.
2. Do not restart the database or delete Redis keys as a first response.
3. Existing answer writes remain valid in Postgres; host answer counts may lag.
4. Subscriber reconnect closes active SSE streams; browsers reconnect and
   rebuild their state from Postgres once Redis recovers.
5. If a client still shows an old phase after recovery, close/reopen that room
   stream and check the subscriber reconnect logs.
6. Record the outage duration and Redis subscriber/publisher errors.

## QStash reveal failure

1. Inspect QStash delivery logs for the session and question IDs.
2. Verify the callback domain, QStash signature keys, and `APP_URL` exactly
   match the deployment.
3. A repeated callback is safe: the session update is conditional and stale
   callbacks return success without changing a later round.
4. If the callback is early, QStash retries using `Retry-After`.
5. If the callback fails after the deadline, use the host control endpoint only
   after confirming the room is still on that question; never edit the database
   manually during play.

## Stuck room

Check, in order:

1. `GET /api/v1/sessions/{code}` and the host/player SSE connection state.
2. Postgres `sessions.status`, `current_question_id`, `question_started_at`, and
   `revealed`.
3. QStash delivery status for the exact `sessionId`/`questionId` pair.
4. Redis subscriber health and application logs.

The source-of-truth repair is a normal signed host control or a valid QStash
callback. Do not set `revealed` or advance a round without the same conditional
guards used by the application.

## Credential rotation

1. Add the new Redis credential or QStash next signing key to Preview.
2. Verify fan-out and callback delivery.
3. Promote the new environment values to Production and redeploy; Vercel env
   changes affect new deployments only.
4. Remove the old key only after all old function instances and delayed
   messages have drained.

## Load test

Use a dedicated Preview quiz with exactly five questions and a fresh live room.
Install k6 with its `k6/x/sse` extension. The extension is required because a
normal k6 HTTP request waits for the SSE response to end. First prepare real
participants; the script resumes safely from its token file and respects the
join rate limit:

```bash
BASE_URL=https://preview.example.com ROOM_CODE=ABC123 COUNT=52 \
  node scripts/load/prepare.mjs
```

Run each stage on a new room and use a distinct `PLAYERS_FILE` for each room.
Prepare `STAGE_PLAYERS + 2` participants (52, 202, or 1002), then run:

```bash
BASE_URL=https://preview.example.com ROOM_CODE=ABC123 HOST_TOKEN=... \
  STAGE_PLAYERS=50 PLAYERS_FILE=scripts/load/live.players.json \
  pnpm test:load:live
```

The test runs all five questions, holds a player SSE connection per virtual user,
opens a host stream, answers in five-second bursts, and reconnects about 10% of
players. Its thresholds check answer errors/latency, question propagation,
reveal skew, recovery, and all players reaching the end. Run 50 first, then 200,
then 1,000. Keep participant token files private; they are ignored by Git.

Also record provider metrics that k6 cannot see: function duration and cost,
Postgres and Redis connections/operations, QStash delivery lag, and leaked
subscriptions after a room ends. A passing k6 run alone does not establish the
capacity claim; all thresholds in `realtime-scale-plan.md` must pass in a
production-like Preview environment.
