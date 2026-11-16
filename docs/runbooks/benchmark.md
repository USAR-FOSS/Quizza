# Production Load Testing & Capacity Benchmark Runbook

This runbook defines the methodology, capacity thresholds, execution commands, and triage procedures for benchmarking Quizza up to the target architecture of **10 concurrent rooms × 1,000 simultaneous players** (10,000 active SSE streams).

---

## 1. Capacity Targets and Service Level Indicators (SLIs)

| Metric | Target (100 players) | Target (1,000 players) | Fleet Target (10 × 1,000) |
|---|---|---|---|
| **Answer Submission p95** | < 40 ms | < 80 ms | < 120 ms |
| **Answer Submission p99** | < 80 ms | < 150 ms | < 250 ms |
| **SSE Fanout Delay p99** | < 50 ms | < 100 ms | < 180 ms |
| **Lobby Presence Refresh** | < 20 ms | < 35 ms | < 50 ms |
| **Node RSS Memory / Worker** | < 180 MB | < 280 MB | < 450 MB |
| **Redis CPU Core Utilization** | < 10% | < 25% | < 60% |
| **Database Pool Utilization** | < 20% | < 50% | < 75% |

---

## 2. Concurrency Architecture & Pipelining

Quizza uses three tiers to scale real-time traffic without saturating the relational database:

1. **Multiplexed Redis Subscriber**:
   - Exactly **one** subscriber connection per warm Node application process, regardless of how many browsers connect.
   - SSE client streams consume an in-memory Node EventEmitter backed by the single Redis connection.
2. **Pipelined Redis Counters**:
   - Answer count increments use Redis `multi().incr().expire().exec()` pipelining.
   - Sequential round trips are eliminated, reducing Redis network hops by 50% during answer bursts.
3. **Sorted-Set Presence Leases**:
   - Participants maintain a 65-second lease in a Redis sorted set (`presenceKey(sessionId)`).
   - Fast $O(\log N)$ online participant counts are evaluated via `ZCOUNT` without transferring participant lists over the network.
   - Roster batch cleanup and eviction use multi-key `ZREM` batching.

---

## 3. Pre-Benchmark Infrastructure Verification

Before running load tests, verify system readiness using the diagnostic probe endpoint:

```bash
# Verify internal latency and memory
curl -H "x-internal-health-secret: $INTERNAL_HEALTH_SECRET" \
  https://quizza.example.com/api/internal/health
```

Expected diagnostic response:
```json
{
  "ok": true,
  "status": "healthy",
  "timestamp": "2026-11-15T09:00:00.000Z",
  "uptimeSeconds": 1420,
  "environment": "production",
  "system": {
    "nodeVersion": "v24.16.0",
    "platform": "linux",
    "memory": {
      "rss": { "bytes": 84213760, "megabytes": 80.31 },
      "heapUsed": { "bytes": 48123904, "megabytes": 45.89 }
    }
  },
  "checks": {
    "postgres": { "status": "ok", "latencyMs": 1.4 },
    "redis": { "status": "ok", "latencyMs": 0.6, "driver": "redis" }
  }
}
```

---

## 4. Benchmark Execution Stages

### Stage 1: Dual-Instance Integration Smoke Test
Validates cross-process message propagation and state rehydration across two standalone Next.js instances:

```bash
ROOM_CODE=TST123 \
HOST_TOKEN=host_secret_token \
REDIS_URL=redis://localhost:6379 \
DATABASE_URL=postgres://user:pass@localhost:5432/quizza \
pnpm test:integration:realtime
```

### Stage 2: Participant Token Pre-Generation
Generates participant cookies and tokens matching the room rate limit:

```bash
BASE_URL=https://staging.quizza.example.com \
ROOM_CODE=LOD100 \
COUNT=1002 \
node scripts/load/prepare.mjs
```

### Stage 3: Live Room Stress Run (k6)
Executes a multi-question interactive quiz session with real SSE streams, answer bursts, and randomized reconnects:

```bash
BASE_URL=https://staging.quizza.example.com \
ROOM_CODE=LOD100 \
HOST_TOKEN=host_secret_token \
STAGE_PLAYERS=1000 \
PLAYERS_FILE=scripts/load/live.players.json \
pnpm test:load:live
```

### Stage 4: Multi-Room Fleet Benchmark
To test 10 concurrent rooms, fan out the k6 runner across 10 workers in parallel:

```bash
for ROOM in ROOM01 ROOM02 ROOM03 ROOM04 ROOM05 ROOM06 ROOM07 ROOM08 ROOM09 ROOM10; do
  BASE_URL=https://staging.quizza.example.com \
  ROOM_CODE=$ROOM \
  STAGE_PLAYERS=1000 \
  pnpm test:load:live &
done
wait
```

---

## 5. Live Triage & Bottleneck Remediation

### Database Connection Exhaustion
- **Symptom**: `remaining connection slots are reserved for non-replication superuser connections` or `ETIMEDOUT` in Postgres probe.
- **Remediation**:
  1. Route all application database connections through PgBouncer in `transaction` mode.
  2. Set `max: 20` per Node process.
  3. Ensure answer inserts use indexed compound keys (`sessionId`, `questionId`, `participantId`).

### Redis Latency Spikes (> 10ms)
- **Symptom**: `checks.redis.latencyMs` spikes above 10ms in `/api/internal/health`.
- **Remediation**:
  1. Inspect Redis slowlog: `redis-cli slowlog get 10`.
  2. Avoid unindexed `KEYS *` or full `ZRANGE` scans; ensure `ZCOUNT` and `EVAL` with bounded keys are used.
  3. Verify Redis memory policy is set to `volatile-lru` or `noeviction` (do not use `allkeys-lru` which could evict active session state).

### Client Disconnect Churn & Proxy Buffering
- **Symptom**: SSE streams abruptly terminate after 60 seconds.
- **Remediation**:
  1. Set proxy response buffering to disabled (`X-Accel-Buffering: no`).
  2. Increase proxy read timeout (Nginx `proxy_read_timeout 300s`, Cloudflare tunnel timeout).
  3. Ensure application sends 25-second ping comments (`: keep-alive\n\n`).
