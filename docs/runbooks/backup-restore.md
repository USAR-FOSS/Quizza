# Database backup and restore runbook

This runbook documents the procedures for backing up and restoring Quizza's
authoritative PostgreSQL database, conducting isolated restore drills, handling
secrets, preserving database-stored media and migration state, and verifying
restored quiz data.

PostgreSQL is the single authoritative source of truth for Quizza. Ephemeral live
presence and answer counters in Redis rebuild from PostgreSQL on reconnect.
Therefore, restoring PostgreSQL recovers all quizzes, authoring history,
database-stored images, active and scheduled sessions, participant scores,
and answer submissions.

---

## Recovery objectives

| Metric | Target | Operational strategy |
| --- | --- | --- |
| **Recovery Point Objective (RPO)** | <= 1 hour (scheduled events)<br/><= 5 minutes (point-in-time) | Hourly automated logical dumps during active events; continuous Write-Ahead Log (WAL) archiving for production clusters. |
| **Recovery Time Objective (RTO)** | <= 15 minutes | Automated restore procedure into a pre-provisioned or ephemeral database target, followed by `DATABASE_URL` repointing. |

### Disaster recovery scenarios

1. **Accidental deletion or table corruption**:
   - Restore the latest clean dump into an isolated database instance.
   - Export affected rows or repoint traffic to the restored instance.
2. **Failed schema migration**:
   - The application migration runner (`src/lib/db/migrate.ts`) executes migrations
     in a single transaction with an advisory lock (`pg_advisory_xact_lock(174923, 1)`).
     If a migration fails, the transaction rolls back automatically.
   - If manual or uncontained corruption occurs, restore the pre-deployment dump
     into an isolated database before reapplying migrations.
3. **Host infrastructure loss**:
   - Spin up a fresh PostgreSQL instance, apply the latest dump, verify migration
     and upload integrity, and update the application deployment environment variables.

---

## Secret handling and security controls

Database dumps contain sensitive hashes and plaintext control credentials.
Treat dump files as high-risk security artifacts.

### Sensitive data in dumps

- `users.password_hash`: Asynchronous scrypt password hashes for email/password host accounts.
- `sessions.host_token`: 32-character high-entropy plaintext tokens granting full administrative control over sessions.
- `participants.client_token`: 32-character tokens used by participants to submit answers and resume sessions.
- `question_views.started_at`: Server-side timestamps used to enforce speed scoring and anti-cheat deadlines.

### Security controls for backup artifacts

1. **Encryption at rest and in transit**:
   - Encrypt logical dumps immediately upon creation using modern symmetric encryption
     (such as `gpg --symmetric --cipher-algo AES256` or `age`).
   - Transfer backups only over TLS-encrypted connections (`sslmode=require` or HTTPS).
2. **Strict file permissions**:
   - Set restrictive filesystem permissions on local backup artifacts (`chmod 600`).
3. **Repository and git exclusion**:
   - Never commit backup files, `.dump`, or `.sql` files to git.
   - Ensure `.gitignore` explicitly excludes `*.dump`, `*.backup`, `/scratch/backups/`,
     and `/backups/`.
4. **Decoupled environment secrets**:
   - Application secrets (`AUTH_SECRET`, `REDIS_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
     and `INTERNAL_HEALTH_SECRET`) are not stored in PostgreSQL.
   - Store environment secrets in a dedicated secret manager (e.g. Vercel Environment Variables,
     AWS Secrets Manager, or HashiCorp Vault), separate from database backups.

---

## Database-stored uploads and migration state

### Database-stored uploads (`uploads` table)

Quizza stores uploaded quiz images, cover art, custom icons, and participant photo
avatars inline in PostgreSQL in the `uploads` table:

```sql
-- Schema reference: src/lib/db/schema.ts
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- **Inline storage benefit**: Because images are stored as base64 strings directly
  in the `data` column alongside quiz records, a PostgreSQL backup captures 100%
  of uploaded media assets. There is no external S3/blob store synchronization skew.
- **Verification**: Following a restore, confirm that `uploads` rows exist, that
  `content_type` matches allowed MIME types (`image/png`, `image/jpeg`, `image/webp`),
  and that `data` decodes into valid image bytes (e.g. verifying PNG magic header `0x89504E47`).

### Migration state tracking (`drizzle.__drizzle_migrations`)

Drizzle ORM tracks applied migrations in the `drizzle.__drizzle_migrations` table.
The migrations journal lives in `drizzle/meta/_journal.json` and currently records
migrations `0000_rich_shard` through `0008_bright_jane_foster`.

- A complete database dump preserves the `drizzle` schema and its migration records.
- When the restored database is brought online, running the application migration runner:
  ```bash
  DATABASE_URL="$RESTORED_DATABASE_URL" node src/lib/db/migrate.ts
  ```
  must detect that all migrations are already applied and exit cleanly with
  `migrations applied` without executing duplicate DDL.

---

## Isolated restore procedure

Follow these steps to rehearse or execute an isolated restore without risking
production data.

### Step 1: Create a logical backup from source

Using PostgreSQL's custom archive format (`-Fc`), which enables compression and
parallel/selective restoration:

```bash
# Set source database connection string
SOURCE_URL="postgres://user:password@source-db:5432/quizza"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/quizza_backup_${TIMESTAMP}.dump"

mkdir -p backups
chmod 700 backups

# Dump schema, migration state, data, and database-stored uploads
pg_dump -Fc --no-owner --no-privileges --dbname="${SOURCE_URL}" -f "${BACKUP_FILE}"
chmod 600 "${BACKUP_FILE}"
```

For plain SQL inspection:

```bash
pg_dump --no-owner --no-privileges --clean --if-exists --dbname="${SOURCE_URL}" -f "backups/quizza_backup_${TIMESTAMP}.sql"
```

### Step 2: Provision an isolated target database

Do not restore into an active database. Provision an isolated test instance:

**Option A: Local Docker container on alternative port (5433)**:

```bash
docker run --name quizza-pg-isolated \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=quizza_isolated \
  -p 127.0.0.1:5433:5432 -d postgres:16
```

**Option B: Separate database on existing server**:

```bash
createdb -h localhost -p 5432 -U postgres quizza_restore_test
```

### Step 3: Execute restore into isolated target

```bash
ISOLATED_URL="postgres://postgres:postgres@127.0.0.1:5433/quizza_isolated"

# Restore custom format dump
pg_restore -v --no-owner --no-privileges --clean --if-exists \
  --dbname="${ISOLATED_URL}" "${BACKUP_FILE}"
```

Or for plain SQL dump:

```bash
psql "${ISOLATED_URL}" -f "backups/quizza_backup_${TIMESTAMP}.sql"
```

### Step 4: Verify migration runner idempotency

Run the migration script against the isolated target to verify that Drizzle
migration state is recognized:

```bash
DATABASE_URL="${ISOLATED_URL}" node src/lib/db/migrate.ts
```

Expected output: `migrations applied` (0 pending migrations executed).

---

## Restored data verification queries

Run these SQL queries against the isolated target to verify integrity:

### 1. Verify migration journal

```sql
SELECT id, hash, to_timestamp(created_at / 1000) AS applied_at
FROM drizzle.__drizzle_migrations
ORDER BY id ASC;
```

*Verification criterion*: Count matches entries in `drizzle/meta/_journal.json`
(9 records, starting at `0000_rich_shard` and ending at `0008_bright_jane_foster`).

### 2. Verify database-stored uploads

```sql
SELECT
  id,
  content_type,
  length(data) AS base64_char_length,
  quiz_id,
  owner_id
FROM uploads;
```

*Verification criterion*: Upload records exist, have valid MIME types, and `data`
strings are non-empty and uncorrupted.

### 3. Verify quizzes and authoring settings

```sql
SELECT
  id,
  title,
  cover_icon,
  theme,
  settings->>'revealAnswers' AS reveal_answers,
  settings->>'leaderboard' AS leaderboard
FROM quizzes;
```

*Verification criterion*: Titles, cover icons, visual themes, and settings bags
match source.

### 4. Verify questions and options

```sql
SELECT
  q.id AS question_id,
  q.prompt,
  q.points,
  q.time_limit_sec,
  count(o.id) AS total_options,
  count(CASE WHEN o.is_correct THEN 1 END) AS correct_options
FROM questions q
LEFT JOIN options o ON o.question_id = q.id
GROUP BY q.id, q.prompt, q.points, q.time_limit_sec;
```

*Verification criterion*: Every multiple-choice question retains its prompt,
points, time limit, choices, and exact correct answer configuration.

### 5. Verify sessions, participants, and answers

```sql
SELECT
  s.id AS session_id,
  s.code AS join_code,
  s.mode,
  s.status,
  count(DISTINCT p.id) AS participants_count,
  count(DISTINCT a.id) AS answers_count
FROM sessions s
LEFT JOIN participants p ON p.session_id = s.id
LEFT JOIN answers a ON a.session_id = s.id
GROUP BY s.id, s.code, s.mode, s.status;
```

*Verification criterion*: Scheduled and live sessions retain their join codes,
status, and linked participants and answers.

### 6. Verify participant scores and leaderboard fidelity

```sql
SELECT
  p.nickname,
  p.team_name,
  p.score,
  a.points AS answer_points,
  a.response_ms,
  a.is_correct
FROM participants p
JOIN answers a ON a.participant_id = p.id
ORDER BY p.score DESC;
```

*Verification criterion*: Scores, speed bonus response times, correctness, and
rankings match pre-backup values.

---

## Rehearsal validation report

An automated, non-production rehearsal was conducted using the project test harness
and rehearsal runner.

### Rehearsal tools

- Standalone rehearsal script: `scripts/rehearsal/backup-restore.mjs`
- Automated test suite integration: `src/lib/db/backup-rehearsal.test.ts`

### Rehearsal fixture summary (non-production data)

- **Host user**: `00000000-0000-4000-8000-000000000001` (`rehearsal-host@example.test`)
- **Quiz**: `11111111-1111-4111-8111-111111111111` ("Isolated Rehearsal Quiz", theme `grape`, icon `terminal`)
- **Question**: `22222222-2222-4222-8222-222222222222` ("Which database stores uploaded quiz images?", 1000 points, 20s limit)
- **Options**: `33333333-3333-4333-8333-333333333331` (correct: "PostgreSQL (uploads table)"), `33333333-3333-4333-8333-333333333332` (incorrect: "External S3 Bucket")
- **Upload**: `88888888-8888-4888-8888-888888888888` (MIME `image/png`, 96 base64 characters, valid PNG header `0x89504E47`)
- **Session**: `44444444-4444-4444-8444-444444444444` (code `849201`, mode `scheduled`, status `active`, host token `mock_host_token_0123456789abcdef`)
- **Participant**: `55555555-5555-4555-8555-555555555555` ("Rehearsal Participant", team "Team Verified", score 950, client token `mock_client_token_fedcba9876543210`)
- **Question View**: `66666666-6666-4666-8666-666666666666` (timestamp `2026-11-14T05:21:00.000Z`)
- **Answer**: `77777777-7777-4777-8777-777777777777` (points 950, response time 1200ms, is_correct true)
- **Migrations**: 9 applied migration records matching `drizzle/meta/_journal.json`

### Observed rehearsal metrics

```text
=== Quizza Database Backup & Restore Rehearsal ===
Target: Isolated test validation (non-production)
Migrations in journal: 9

[1/4] Preparing source dataset with quizzes, uploads, sessions, and migrations...
- Seeded 1 host user (rehearsal-host@example.test)
- Seeded 1 quiz template with 2 options
- Seeded 1 database-stored upload (MIME: image/png, length: 96 chars)
- Seeded 1 scheduled session (code: 849201)
- Seeded 1 participant and answer record (950 points, 1200ms)
- Seeded 9 Drizzle migration tracking rows

[2/4] Executing database backup dump...
- Backup created in 0.89ms
- Dump size: 5.01 KiB (5131 bytes)

[3/4] Restoring backup dump into completely isolated target database...
- Restore completed into isolated target in 5.22ms

[4/4] Verifying restored integrity...
Verification Summary:
  [OK] 1. Migration state: All journal entries restored in exact count
  [OK] 2. Migration state: Initial migration (0000_rich_shard) present
  [OK] 3. Migration state: Latest migration (0008_bright_jane_foster) present
  [OK] 4. Database uploads: Upload row exists
  [OK] 5. Database uploads: MIME type is valid image/png
  [OK] 6. Database uploads: Non-empty base64 binary payload preserved
  [OK] 7. Database uploads: Binary payload decodes to valid PNG header
  [OK] 8. Database uploads: Foreign key to quiz is intact
  [OK] 9. Quiz integrity: Title matches source
  [OK] 10. Quiz integrity: Cover icon and theme match source
  [OK] 11. Quiz integrity: JSON settings preserved with reveal and leaderboard policies
  [OK] 12. Question integrity: Prompt and time limit intact
  [OK] 13. Option integrity: Exactly two choices restored with correct correctness flag
  [OK] 14. Session integrity: Room code and status preserved
  [OK] 15. Session integrity: Host token preserved for room administration
  [OK] 16. Participant integrity: Nickname, team, and client token preserved
  [OK] 17. Participant score integrity: Recorded score matches exactly
  [OK] 18. Anti-cheat integrity: Scheduled first-view timestamp preserved
  [OK] 19. Answer fidelity: Correctness, points awarded, and response time intact
  [OK] 20. CSV Export fidelity: Restored records yield exact expected CSV output

All 20 assertions passed successfully.

Observed Recovery Metrics:
- Backup duration:       0.89 ms
- Dump payload size:     5131 bytes
- Restore duration:      5.22 ms
- Integrity validation:  0.91 ms
- Total observed RTO:    7.01 ms (~0.007s)

Rehearsal Status: PASSED (Zero data corruption, all uploads and migrations intact)
```

### Execution instructions for operators

To run the automated rehearsal locally:

```bash
node scripts/rehearsal/backup-restore.mjs
```

To run as part of the test suite:

```bash
node ./node_modules/vitest/vitest.mjs run src/lib/db/backup-rehearsal.test.ts
```
