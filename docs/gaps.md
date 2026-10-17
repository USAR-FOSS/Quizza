# Current implementation and remaining gaps

This replaces the older backlog, which mixed already shipped fixes with open
items. Checked behavior below is backed by the unit suite and local browser
smoke checks; production scale has not been load-tested.

## Implemented

- Live host/player flow over SSE; scheduled windows, per-question timers,
  question and option shuffling, reveal/leaderboard policies, anonymous and
  restricted participation modes.
- Email/password and optional FOSSClub OIDC host authentication. Password hashing
  uses asynchronous scrypt so sign-in does not block quiz traffic.
- Every authoring server action checks the signed-in owner, including nested
  question and option changes. Questions cannot be changed during a running
  session. Orphaned quizzes are not publicly claimable.
- Autosave debounces per field, serializes writes, reports failures, provides a
  retry, warns on closing with unsaved writes, and flushes before presenting.
- Persistent scheduled first-view timestamps survive reload and repeated token
  requests. Missing/invalid view tokens and expired/revealed question submissions
  are rejected. Client elapsed time cannot substitute for the server clock.
- Answer insertion and participant score changes share a transaction. Unique
  constraints prevent duplicate answers; locked per-player checks enforce the
  host's one-to-three shared powerup charges. Scale bounds and
  configured word-cloud entry counts are validated on the server.
- Optional Double up, Safety net, Shield, and Attack powerups, with one to three
  total charges per player. Shield and Attack are live-only; attack transfers
  settle atomically at the shared reveal. Players see their game kit before play.
- Scheduled players can see policy-permitted answers and standings after their
  own attempt finishes, even while the room remains open. Uploaded question
  media remains visible on live reveal and in the final answer review.
- HTTPS question media (images, direct video and audio), with controls, loading
  failures, and no server-side URL fetching. Quiz images, covers, custom icons,
  and player photos can also be uploaded, resized, and stored in Postgres.
- Live players select then explicitly lock in. Correctness and score deltas stay
  private until the server automatically reveals the round to the room. Timers
  recover on reconnect; advancing before reveal is rejected. Host controls use
  conditional writes to prevent double-start/next races.
- New questions default to 100 points. Quiz-wide speed scoring has per-question
  overrides. Live shuffled questions use one shared room order.
- Viewport-bounded, keyboard-accessible question/style/settings dialogs; keyboard
  question reordering; expanded icons, six room palettes, and photo-bubble lobbies.
- Live word clouds, open-text responses, and scale averages. Live scale controls
  follow the configured range. The presenter does not highlight correct options
  before revealing.
- Search/sort and duplicate quizzes; recent session history, end a session early,
  and recover a host token through the authenticated owner on another browser.
- Owner-only draft previews show each question as a participant, support practice
  answers, and pause timers without creating a session or saving responses.
- Host CSV export escapes spreadsheet formulas and uses a Bearer header instead
  of a secret in a download URL. JSON aggregate summaries are downloadable.
- Public question aggregates are withheld while a session runs. Results honor
  answer and leaderboard policies. Failed results requests display an error.
- Answer counts use a Redis counter and host-only tick events; joins use small
  roster events. Live players
  recover their answered IDs and used powerups after reloading, and see connection
  recovery messages rather than silently losing their place.
- Quip mascot, redesigned landing/dashboard, no-account interactive demo,
  responsive layouts, loading skeletons, error/404 screens, motion preferences,
  keyboard focus and join-code paste/arrow handling.

## Still open

### Product features

- Question duplication and option reordering.
- QR join codes, pause/extend a live question, participant cap/kick controls.
- Participant-specific answer review and richer host drill-down/analytics.
- Additional powerups such as hints; music, uploaded audio/video,
  image cropping, and standalone cleanup of replaced uploads.
- Admin tooling, OIDC roles/member restrictions, audit logs, account recovery.
- A session snapshot of the quiz template for long-term immutable historical
  reporting; current sessions reference their template, which may be edited after
  all its runs finish.

### Infrastructure and integrity limits

- Redis Pub/Sub now backs SSE fan-out and Redis-backed fixed-window rate limits
  are shared across app instances. QStash now owns automatic live reveals, with
  signed, idempotent callbacks. Pub/Sub remains at-most-once by design, so SSE
  reconnects always rebuild state from Postgres.
  Current uploads are public by unguessable URL, not private media storage.
- The PRD's 10 parallel rooms × 1,000 simultaneous players is a target, not a
  verified capacity claim. Run representative DB/SSE load tests and monitor the
  deployment before relying on that scale.
- Per-device attempts are best-effort because cookies can be cleared. Require
  signed-in participation for one attempt per account.
- Scheduled question lists expose prompts/options before each timer starts.
  Server timing prevents clock forgery and reset, but is not proctoring or proof
  that a participant did not look up an answer. Rework question delivery before
  treating this as a secure examination platform.
- Room codes may be reused after sessions end. Permanent session links should use
  immutable run IDs before archival links are relied upon long-term.
- Production deployment/SSO integration, database backup/recovery, and browser
  compatibility beyond the local Chrome checks still require deployment testing.

See [upgrade notes](upgrade.md) for the required migration and API changes.
