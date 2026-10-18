# Quiz experience and integrity update

## Deploying

`pnpm dev` and Vercel Production builds apply pending migrations automatically.
Other deployment targets should run `pnpm db:migrate` before starting the updated
application. Migration 0003
adds `question_views` and `answers.powerup`, with unique indexes for first views
and once-per-run powerups. Existing quizzes keep powerups disabled. Existing
answer and scoring records remain intact.

Migration 0004 adds participant photo URLs and the `uploads` table, and changes
the database default for new questions to **100 points**. Existing question
point values are preserved. Images live in Postgres, so include them in normal
database backups; no writable public directory or external storage service is needed.

Migrations 0005 and 0006 add powerup attack targets and outcomes, replace the
old one-use unique index with a nonunique lookup index, and add the target
lookup index. Apply them before this release. Existing answers and scores are
preserved; existing quizzes with powerups enabled default to one shared charge.
The subsequent shared-charge, scheduled-results, and media UI fixes add no
further database migration.

Migration 0007 adds nullable `participants.team_name` for team selection.
Apply it before deploying the team picker. Existing participants remain
unassigned. Team names and the 1–4 player limit live in quiz settings; the
join endpoint validates the choice and checks capacity under a database lock.

Optional team email rosters require no additional migration. They are stored
in the existing quiz settings JSON. See [Team email roster](team-roster.md)
for CSV headers, launch rules, and the security limitation of a typed email.

Participation now defaults to one attempt per device when a quiz has no explicit
policy. Quizzes explicitly set to anonymous still allow retries; choose
"Signed in, one try" when account-level replay protection matters. A device
cookie is best-effort and can be cleared. Existing anonymous participants do
not gain a device binding retroactively, so end and relaunch any in-progress
quiz that needs the stricter policy. The participation setting cannot change
while a session is open. Player identities are stored per session ID and
validated against the server before resume, so a reused join code cannot
restore an earlier session's attempt.

Set `AUTH_SECRET` in production. The application no longer signs authentication
or view tokens using a development fallback in production.

## API changes

- Team-enabled sessions expose `teams` with current occupancy and `teamSize`.
  `POST /sessions/{code}/participants` requires `teamName` from that list.
  A full team returns `409 team_full`; results and CSV export include the
  assigned team. Existing quizzes remain individual by default.

- `GET /sessions/{code}/questions/{questionId}/view` returns `viewToken` and
  `startedAt`. It persists the first view; subsequent requests return the same
  timestamp. Scheduled answer submissions require this token. Client `elapsedMs`
  is accepted for compatibility but does not drive scoring.
- Live submissions close at the server deadline; scheduled submissions retain
  one second of transport grace. Live answer writes lock the session row so an
  answer cannot race past the shared reveal.
- `GET /sessions/{code}/participants/me` accepts `x-client-token` and returns that
  participant's answered question IDs, used powerups, and policy-gated personal
  `results`. Live correctness and points remain absent until the shared reveal.
- Live rounds reveal automatically at `questionStartedAt + timeLimitSec`.
  The host advances after the reveal, not before. Submitting an answer in live
  mode always returns `revealed: false` with null correctness and points.
  Public standings are also hidden during the active question. Reconnecting
  catches up an expired round after a process restart.
- `QuizSettings.speedBonus` sets the scoring default for the quiz; a question's
  `speedBonus` overrides it. Correct answers earn 50–100% when enabled, otherwise
  full points. Live question shuffle uses a shared order for the room.
- Questions now carry `mediaUrl`, and live questions carry scale settings.
- `SubmitAnswerBody.powerup` accepts `double`, `safety_net`, `shield`, or
  `attack` when enabled by the host. The host selects one to three powerup uses
  total per player, shared across all enabled types. Double multiplies earned points by two; Safety
  net earns one third of the question points on a miss. Shield blocks attacks
  for the round. Attack requires `powerupTargetId`, steals the target's earned
  question points if they answered correctly, or up to one third of the
  question points from their existing score otherwise. Transfers occur once at
  the live shared reveal. Shield and Attack are live-only. The player receives
  a powerup introduction before play and decides whether to spend one on each
  scored question.
- Scheduled players who finish their own attempt can see the leaderboard and
  answer review immediately when those policies are set to "at end". The host
  opening their results page does not close the scheduled room. Unfinished
  players remain gated until they finish or the scheduled window closes.
- `GET /sessions/{code}/participants?search=...` authenticates with
  `x-client-token` and returns at most 20 other room players to target.
- CSV downloads require `Authorization: Bearer <host token>`. Query-string host
  credentials are no longer accepted for exports. JSON summaries are generated
  from the host's gated results response in the browser.
- Public question statistics are empty until the session finishes. Host results
  remain available during play; existing reveal and leaderboard settings apply.

Paths above are relative to `/api/v1`. The generated OpenAPI UI at `/docs`
documents these endpoints. HTTPS media files load directly in the browser and
must be publicly reachable.

## Uploaded images

`POST /api/v1/uploads` accepts raw PNG, JPEG, or WebP bytes (2 MiB maximum).
Quiz owners provide `x-quiz-id` with their signed-in cookie; joined players
provide `x-room-code` and `x-client-token`. Player uploads also update the room
avatar. Browser requests must have a same-host Origin. The UI downsizes images
and re-encodes to WebP, removing EXIF metadata, before sending them.

Uploads are signature-checked, rate-limited per account/player, and subject to
stored-data allowances (40 MiB encoded per quiz; 6 MiB per player). They are
served publicly by unguessable ID with `nosniff` and a restrictive CSP. Do not
upload confidential images. Images are cascade-deleted with their quiz/player;
duplicating a quiz copies its referenced uploaded assets so deleting the original
does not break the copy. Old/replaced uploads count toward the allowance until
their quiz or player is deleted; standalone asset cleanup remains future work.

Live deadlines and broadcasts use Redis plus QStash in production. The remaining
open item is measured multi-instance capacity and cost at the PRD's full
concurrency target; do not claim that target from unit tests alone.

New production environment variables are documented in `.env.example` and
`docs/deployment.md`: `REDIS_URL`, `REALTIME_DRIVER=redis`, `APP_URL`,
`QSTASH_TOKEN`, both QStash signing keys, and `DB_POOL_MAX`. No database
migration was required for the earlier realtime-only change; this
later powerup update requires migrations 0005 and 0006.

## Validation

The automated suite covers scoring, visibility policy, shuffle, signed tokens,
moderation, media URLs, CSV injection, powerup scoring, authoring authorization,
and server-side answer integrity. Browser smoke checks exercise account creation,
authoring/autosave, scheduling, powerups, CSV export, dashboard layout, the demo,
and live-host recovery/play. Full concurrency/load testing remains open.
