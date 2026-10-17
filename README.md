# quizza

An open-source, no-login-needed live quiz and polling platform. A FOSS
alternative to Mentimeter. Build a quiz, share a room code, and let everyone play
from their phones. Built to self-host.

Status: live and scheduled play, host accounts, quiz authoring, results, and
exports are implemented. The interface includes a playable demo, Quip the quiz
mascot, responsive layouts, accessible loading/error states, and reduced-motion
support. See [the current gaps](docs/gaps.md) for remaining work.

## What it does

- Hosts build a quiz: multiple choice, true or false, poll, word cloud, scale,
  and open text questions.
- A quiz can run in two modes:
  - Live: host-driven, everyone synced to the same question.
  - Scheduled: open for a set window, taken self-paced.
- Players join with a nickname. No account required.
- Answers record accuracy and response time. Scoring rewards speed and accuracy,
  with a leaderboard.
- Hosts sign in through email/password or configured FOSSClub OIDC, own their
  quizzes, and revisit sessions from their dashboard.
  Anonymous play stays first-class.

## Documentation

The full set is indexed in [docs/README.md](docs/README.md). Key documents:

- [docs/sdd.md](docs/sdd.md): System Design Document (C4 diagrams, workflows,
  non-functional requirements, deployment).
- [docs/decisions.md](docs/decisions.md): Architecture Decision Records.
- [docs/threat-model.md](docs/threat-model.md): STRIDE threat model.
- [docs/data-dictionary.md](docs/data-dictionary.md): schema design.
- The HTTP API is documented with OpenAPI 3.1. The spec is at
  `/api/v1/openapi.json` and a browsable UI (Scalar) is at `/docs`. The spec is
  generated from the same zod schemas the handlers validate against.

## Stack

| Area       | Choice                      | Notes |
|------------|-----------------------------|-------|
| Framework  | Next.js 16 (App Router)     | React 19, server components, streaming |
| Language   | TypeScript                  | |
| Styling    | Tailwind CSS v4             | theme tokens in CSS |
| Animation  | motion (Framer Motion)      | respects reduced-motion |
| ORM / DB   | Drizzle + Postgres          | pure TS, no native engine (works on NixOS) |
| Validation | zod                         | shared by forms, actions, and the API |
| Realtime   | SSE + Redis Pub/Sub + QStash | cross-instance fan-out and durable live reveals |

## Local development

```bash
pnpm install
cp .env.example .env.local          # point DATABASE_URL at a Postgres

# spin up a local Postgres:
docker run --name quizza-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=quizza -p 5432:5432 -d postgres:16

pnpm db:generate                    # SQL from the schema into drizzle/
pnpm db:migrate                     # apply migrations
pnpm dev                            # http://localhost:3000
```

For local full-stack development, `docker compose up --build` also starts
Redis. Set `REALTIME_DRIVER=redis` and use a public development URL plus QStash
to exercise durable live reveals; otherwise the default local `memory` driver
keeps ordinary UI work self-contained. Production rejects the memory driver.

Vercel deployments require a pooled `DATABASE_URL`, `REDIS_URL`,
`REALTIME_DRIVER=redis`, `APP_URL`, and the QStash token/signing keys. Follow
[docs/deployment.md](docs/deployment.md) before opening a live room.

We use `db:generate` plus `db:migrate` rather than `db:push` because
`drizzle-kit push` needs an interactive TTY. The migrator at
`src/lib/db/migrate.ts` runs non-interactively.

## Run with Docker

The whole stack (Postgres, a one-shot migration, then the app) runs with one
command:

```bash
docker compose up --build        # app on http://localhost:3000
```

The image is a multi-stage build of Next's standalone output, run as a non-root
user. The `app` service waits for migrations to complete before starting. See
[docs/sdd.md](docs/sdd.md) section 11 and ADR 0019 for the deployment design.

### Scripts

| Script             | Does |
|--------------------|------|
| `pnpm dev`         | dev server |
| `pnpm build`       | production build |
| `pnpm typecheck`   | `tsc --noEmit` |
| `pnpm db:generate` | generate SQL migrations from the schema |
| `pnpm db:migrate`  | apply migrations (non-interactive) |
| `pnpm db:push`     | push schema straight to the DB (needs a TTY) |
| `pnpm db:studio`   | Drizzle Studio (DB browser) |

## Project layout

See [docs/sdd.md](docs/sdd.md) for the full design. In short:
routes under `src/app`, UI under `src/components`, and data, actions, and
realtime under `src/lib`.

## Roadmap

- [x] Design system and landing page
- [x] Data model: quizzes, questions, options, sessions, participants, answers
- [x] Quiz builder: six question types, options, reordering, themes, autosave
- [x] REST API under `/api/v1` with OpenAPI docs (spec at `/api/v1/openapi.json`, UI at `/docs`)
- [x] Scheduled mode, end to end: host launch (`/present/[quizId]`), anonymous player (`/play/[code]`) with timing and accuracy, and results (`/results/[code]`)
- [x] Live mode: presenter (`/host/[code]`) and player over SSE, room code, live reveal and leaderboard
- [x] Host sign-in (email/password + FOSSClub OIDC flow), quiz ownership, my-quizzes dashboard (`/dashboard`)
- [x] Optional double-points and shield powerups, direct HTTPS image/video/audio questions
- [x] Shared server-timed live reveals, explicit player lock-in, private pre-reveal results
- [x] Image/cover/icon/player-photo uploads, avatar-bubble lobbies, six room palettes
- [x] 100-point defaults, quiz-wide speed scoring, viewport-safe question picker
- [x] Authoring ownership checks, durable server timers, deadline enforcement, atomic scoring
- [x] Results export: host CSV with spreadsheet-formula protection, JSON result summaries
- [x] Searchable quiz library, quiz duplication, recent sessions, early session ending, host recovery
- [x] Live word clouds, open-text reveals, configured scale ranges and averages
- [x] Interactive demo and owner-only draft preview, illustrated loading/error states, responsive interface and reduced motion
- [ ] Question/option duplication and reordering polish
- [ ] Host QR codes, question pause/extend, participant moderation and capacity controls
- [x] Shared Redis realtime/rate-limit backend and durable live reveal scheduler
- [ ] Load testing and measured capacity at the PRD's full concurrency target

After updating an existing installation, run `pnpm db:migrate` before starting
the app. Migration 0003 adds durable question views and per-run powerup tracking.
See [upgrade notes](docs/upgrade.md) for API and behavior changes.

## License

To be decided. Intended to be a permissive open-source license.
