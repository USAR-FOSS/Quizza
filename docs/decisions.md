# Decision log

A running record of the architecture and product decisions behind quizza. Each
entry states the context, the decision, and the status. Newest decisions are
appended at the bottom. This file is the source of truth for "why is it built
this way".

Status values: Accepted, Superseded, Proposed.

---

## 0001 - Framework: Next.js 16 (App Router)

- Context: We want one deployable unit serving the marketing site, the builder,
  the player, and the API, with server rendering and good streaming support.
- Decision: Next.js 16 with the App Router, React 19, TypeScript. Cache
  Components are enabled; dynamic routes use Suspense boundaries.
- Status: Accepted.

## 0002 - ORM: Drizzle with Postgres (not Prisma)

- Context: The primary dev machine runs NixOS, where Prisma's prebuilt native
  query engines do not resolve cleanly and the nixpkgs engine version drifts
  from the pinned Prisma version.
- Decision: Use Drizzle ORM with the `postgres` (postgres.js) driver. Drizzle is
  pure TypeScript with no native engine download, which avoids the problem
  entirely. Schema lives in `src/lib/db/schema.ts`.
- Status: Accepted.

## 0003 - Migrations: generate plus migrate (not push)

- Context: `drizzle-kit push` requires an interactive TTY to confirm, which fails
  in non-interactive shells and CI.
- Decision: Use `pnpm db:generate` to produce SQL in `drizzle/`, then
  `pnpm db:migrate` (a small runner at `src/lib/db/migrate.ts`) to apply it. This
  is non-interactive and is the production-correct flow.
- Status: Accepted.

## 0004 - Styling and motion

- Context: The product should feel lively without a heavy UI framework.
- Decision: Tailwind CSS v4 with theme tokens defined in CSS, and `motion`
  (Framer Motion) for animation. Animations respect `prefers-reduced-motion`.
- Status: Accepted.

## 0005 - Tone and visual identity: plain, no emoji

- Context: The product should read as professional and clean.
- Decision: No emoji, no em dashes, and no jokey copy anywhere, including UI,
  docs, and code comments. Liveliness comes from motion, color, and typography.
  Identity that previously used emoji is now color plus icon: quiz covers use a
  lucide icon key (`quizzes.cover_icon`) and a theme color; player avatars use a
  palette color (`participants.avatar_color`) with a monogram derived from the
  nickname.
- Status: Accepted. (Supersedes the earlier emoji-forward direction.)

## 0006 - Anonymous-first participation

- Context: Lowering the barrier to join is a core goal.
- Decision: Players join a room with only a nickname and a chosen color. No
  account is required. Reconnection uses a client token stored on the device.
  Sign-in is additive and never required to play.
- Status: Accepted.

## 0007 - Join codes

- Context: Codes are read off a screen and typed on phones.
- Decision: Six-digit numeric codes. A code is unique among non-ended sessions
  (enforced by a partial unique index) and may be reused after a session ends.
- Status: Accepted.

## 0008 - Two run modes: live and scheduled

- Context: Some sessions are run live with a host; others should be open for a
  window so people take them on their own time (for example over a day).
- Decision: A session has a `mode` of `live` or `scheduled`. Live mode is
  host-driven and synced. Scheduled mode opens between `opens_at` and
  `closes_at` and is self-paced. Both modes write through the same `answers`
  pipeline, which records `is_correct`, `response_ms`, and `points`, so results
  and timing are captured identically.
- Status: Accepted.

## 0009 - Realtime transport: SSE plus request/response (not WebSockets)

- Context: A room is asymmetric. One presenter broadcasts to many players
  (downstream, high fan-out), and players send occasional one-shot submissions
  (upstream, low volume). At the target scale this does not need a bidirectional
  socket.
- Decision: Server-to-client updates use Server-Sent Events. Client-to-server
  actions (join, submit) use server actions and REST route handlers. A small
  in-process pub/sub bus fans events out to SSE connections, behind an interface
  so a Postgres `LISTEN/NOTIFY` adapter can replace it for multi-instance
  deployments without touching call sites. We do not rebroadcast per answer:
  phase changes broadcast once to everyone, and live answer counts go to the
  presenter connection only.
- Status: Accepted.

## 0010 - Scale posture

- Context: Premature scaling work would slow the build.
- Decision: Target roughly 1000 concurrent participants for about an hour on a
  single self-hosted instance. Do not optimize beyond that now. The documented
  path to scale out is horizontal app instances with a `LISTEN/NOTIFY` or Redis
  backplane and a Postgres connection pooler; revisit when needed.
- Status: Superseded by 0015 (the PRD sets a concrete capacity target).

## 0011 - API surface and documentation: REST plus OpenAPI

- Context: The project requires clear, standard API documentation from the
  start. Server actions are opaque RPC and are not describable in OpenAPI.
- Decision: The runtime and play surface (sessions, join, submit, results) is
  built as versioned REST route handlers under `/api/v1`. An OpenAPI 3.1
  document is generated from the same zod schemas used for validation and served
  through a docs UI. Builder CRUD (used only by our own builder UI) stays as
  server actions for now and is recorded here as internal; it may be exposed as
  REST later. The OpenAPI tooling is introduced alongside the first REST
  endpoints so the spec always reflects real routes.
- Status: Accepted.

## 0012 - Authentication: OIDC via FOSSClub

- Context: Hosts need durable accounts to own quizzes and revisit them (the
  save-for-later feature). FOSSClub provides an OIDC provider.
- Decision: Integrate FOSSClub OIDC (`https://oidc.fossclub.tech`) using the
  authorization code flow with PKCE (S256). Sign-in is for hosts and is
  additive; anonymous play is unaffected. There is no dynamic client
  registration, so client credentials are configured via environment variables.
- Status: Proposed (not yet implemented).

## 0013 - Scoring

- Context: Both run modes need the same scoring so a response is worth the same
  regardless of how the session is run.
- Decision: Scoring is pure (`src/lib/scoring.ts`). Non-scorable questions and
  wrong answers earn 0. Correct answers earn the question's points. When a
  question enables a speed bonus, points scale from full (instant) down to half
  at the time limit, never below half. Response time is measured server-side in
  live mode (from when the question went live) and reported by the client in
  scheduled mode (clamped to the time limit), since scheduled play is self-paced.
- Status: Accepted.

## 0014 - Host authentication: OIDC and email/password

- Context: The PRD requires hosts to sign in before creating quizzes, via
  FOSSClub SSO or an email and password account. Participants stay anonymous.
- Decision: Support two host sign-in methods: FOSSClub OIDC (authorization code
  with PKCE, per 0012) and local email and password accounts. Both resolve to a
  row in `users`. Local accounts add `password_hash` (Argon2id); OIDC accounts
  use `subject`. A `role` column distinguishes host and admin. Authorization is
  enforced on quiz ownership and host-only session control.
- Update: FOSSClub OIDC is the primary and intended sign-in path. Email and
  password stays only as a lightweight fallback, so there is deliberately no
  email verification or password-reset flow (nothing to verify when sign-in is
  delegated to the provider). Argon2id was replaced by Node's built-in scrypt to
  avoid a native dependency.
- Status: Implemented. OIDC (0012) and email/password both work; session is a
  signed cookie.

## 0015 - Capacity target and scale-out architecture

- Context: The PRD sets a concrete target: up to 10 quizzes in parallel at 1000
  participants each (about 10,000 concurrent), with a peak of 1000 simultaneous
  submissions within one quiz. This supersedes the earlier informal posture in
  0010.
- Decision: Target the PRD capacity with a horizontally scaled, room-sharded
  design. Run multiple stateless app instances behind a load balancer. Replace
  the in-process bus with a shared backplane (Postgres `LISTEN/NOTIFY` first,
  Redis pub/sub as the fallback) behind the existing bus interface. Put PgBouncer
  in front of Postgres. Keep fan-out cheap: one snapshot per phase change, host-
  only answer counts, never per-answer broadcasts to all players. Build and
  validate this before taking multi-room production load. The current shipped
  build remains single-instance and is sufficient for a single room of the
  target size.
- Status: Accepted. Not yet implemented.

## 0016 - Engagement features are post-MVP with reserved extension points

- Context: The PRD lists powerups (shield, attack, hint), in-question
  multimedia, host-defined custom participant fields, and quests. These are
  valuable but not required for the first usable product.
- Decision: Defer these past the MVP, but reserve data-model extension points now
  so they do not force a redesign: `questions.media_url` already exists; powerups
  will add a catalog and a per-participant ledger; custom fields will add a quiz-
  level field definition plus a participant-response store. Documented in the
  data dictionary under planned extensions.
- Status: Accepted.

## 0017 - Documentation standard

- Context: The project values clear documentation from the start.
- Decision: Maintain a fixed documentation set: a PRD (product), an SDD with C4
  and sequence diagrams (design), this ADR log (decisions), a STRIDE threat model
  (security), a data dictionary (storage), and OpenAPI (API reference). Diagrams
  use Mermaid so they render in common viewers. An index in `docs/README.md` maps
  the set. New significant decisions are appended here, never rewritten in place.
- Status: Accepted.

## 0018 - Operating capacity target (single instance)

- Context: The 10-by-1000 figure in 0015 was an aspiration. The realistic target
  the system must run stably against is 1000 to 2000 participants, each making
  about 30 submissions over 30 to 45 minutes of active play, inside an event
  window of up to 4 hours (primarily scheduled mode).
- Decision: Target a single instance. The load works out to roughly 4
  submissions per second averaged over the window, about 22 per second if
  clustered into a 45-minute block, and 50 to 70 per second at peak; a live room
  of this size adds 1000 to 2000 held-open SSE connections and a synchronized
  burst of a few hundred inserts per second for a few seconds. One Node process
  plus Postgres handles all of this with headroom. No horizontal scaling, no
  external backplane, and no connection pooler are needed for this target. The
  binding requirement is stability over 4 hours: SSE cleanup on disconnect, no
  unbounded memory growth, and a Postgres pool of about 15 to 20 connections.
- Consequences: 0015's scale-out architecture is retained as a documented
  contingency, not near-term work. Effort goes to correctness and stability
  rather than premature scaling.
- Status: Accepted. Supersedes 0015 as the near-term target; 0015 remains the
  contingency plan.

## 0019 - Containerized deployment

- Context: We want reproducible builds, dev and prod parity, deploy-anywhere, and
  a clean path to scaling later without re-platforming.
- Decision: Ship the app as a Docker image. A multi-stage Dockerfile installs
  dependencies, builds Next's standalone output, and runs it from a minimal
  non-root runtime image. A separate `migrator` build target applies database
  migrations. `docker-compose.yml` wires Postgres, a one-shot migration, and the
  app for local and single-host deployment. The single-instance target (ADR
  0018) is one app container plus Postgres; the in-process bus is unaffected.
  Scaling to multiple replicas is a config change (replica count) and is exactly
  when the shared backplane from ADR 0015 becomes required, because the in-
  process bus does not span containers.
- Consequences: `next.config.ts` sets `output: "standalone"`. Secrets stay in the
  environment, never baked into the image (`.dockerignore` excludes `.env*`).
- Status: Accepted.

## 0020 - Future high-scale backend in Go (direction only)

- Context: Beyond the operating target (ADR 0018), there is a longer-term ambition
  to serve very large scale with a resource-efficient system.
- Decision: The intended direction is to move the high-throughput realtime and
  submission tier to a dedicated Go backend for lower memory and CPU per
  connection, while keeping the Next.js app for the builder, pages, and
  non-hot-path APIs. This is a direction note only. Nothing is built or changed
  now. The current TypeScript and Next.js backend is sufficient for the operating
  target, and the realtime bus already sits behind an interface, which keeps this
  future split cheap. Revisit when real load approaches the limits in ADR 0015.
- Status: Proposed (not scheduled; no work now).

## 0021 - Redis Pub/Sub and QStash for horizontally scaled live play

- Context: Vercel functions can be created on different instances and can scale
  to zero. The in-process event bus, reveal timers, and rate limiter cannot
  provide reliable live play across those instances.
- Decision: Postgres remains the source of truth. Standard Redis Pub/Sub carries
  versioned state, roster, and host-only answer-count events across instances;
  a local subscription registry fans each Redis channel out to the SSE streams
  in that instance. Redis counters handle host answer counts and fixed-window
  rate limits. QStash sends a signed, delayed reveal callback. The callback is
  idempotent and conditionally updates the exact session/question/start-time
  tuple. SSE streams rotate before the platform duration limit and reconnect to
  rebuild state from Postgres because Pub/Sub is at-most-once.
- Consequences: Redis and QStash are required for production live mode. A Redis
  outage may delay UI fan-out but cannot corrupt durable answers or reveal state.
  Load testing must measure SSE duration, function concurrency, Redis subscriber
  count, database pool usage, reveal skew, and cost before claiming capacity.
- Status: Implemented; capacity validation remains open.
