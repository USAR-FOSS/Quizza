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
- Hosts can enable team selection, import up to 5,000 deduplicated team names
  from CSV, and limit each team to 1–4 players. Players search for a team when joining.
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

Use Node.js 24 and pnpm 12.4.1 (the version in `packageManager`). The migration
runner executes TypeScript directly with Node, so older Node versions are not
supported. Install pnpm with `npm install --global pnpm@12.4.1` if needed.

```bash
git clone https://github.com/USAR-FOSS/Quizza.git
cd Quizza
pnpm install --frozen-lockfile
cp .env.example .env.local
openssl rand -hex 32               # paste the output into AUTH_SECRET in .env.local

# Skip this if you already have a local Postgres on port 5432.
docker run --name quizza-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=quizza -p 127.0.0.1:5432:5432 -d postgres:16

pnpm dev                          # applies checked-in migrations, then starts port 3000
```

Open `/login`, choose **Create account**, then create a quiz from the dashboard.
Add a prompt and options, mark a correct answer, and launch a live room. Join
with its code in a separate browser profile. Hosts need accounts; anonymous
players do not. `/demo` is available without signing in.

Do not run `db:generate` for a fresh checkout. Run it only when changing the
schema, and include the generated SQL and metadata in your pull request.

The default `REALTIME_DRIVER=memory` supports local live and scheduled play
without Redis or QStash. Production requires Redis; publicly hosted production
live rooms also require QStash and a reachable `APP_URL`. See
[deployment](docs/deployment.md). Fonts and their licenses are bundled locally;
builds do not download fonts.

## Run with Docker

After copying `.env.example` to `.env.local` and setting a generated
`AUTH_SECRET`, run:

```bash
docker compose --env-file .env.local up --build
```

This starts Postgres, Redis, a one-shot migration, and the app on
`http://localhost:3000`. Compose uses internal database and Redis addresses and
passes auth, OIDC, and QStash settings from the env file. It rejects a missing
`AUTH_SECRET` before starting. The image runs as a non-root user.

The localhost configuration uses in-process reveal timers for development.
For public hosting, set `APP_URL` to your HTTPS origin and configure QStash
credentials and signing keys. See [deployment](docs/deployment.md).

### Scripts

| Script             | Does |
|--------------------|------|
| `pnpm dev`         | dev server |
| `pnpm build`       | production build |
| `pnpm test`      | unit and handler regression tests |
| `pnpm lint`      | ESLint checks |
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
- [x] Configurable Double up, Safety net, Shield, and Attack powerups; direct HTTPS image/video/audio questions
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

`pnpm dev` and Vercel Production builds apply pending migrations before starting
the app. Other deployment targets should run `pnpm db:migrate` before `pnpm start`.
Migrations 0003–0006 cover durable question views, image uploads,
and the repeatable powerup/attack model. Migration 0007 adds participant team
assignments; migration 0008 adds roster email claims. Apply all pending migrations
before deploying team selection or roster eligibility.
See [upgrade notes](docs/upgrade.md) for API and behavior changes.

## License

Copyright 2026 Quizza contributors. Licensed under [Apache-2.0](LICENSE).
Bundled fonts retain their [SIL OFL licenses](src/app/fonts/README.md).
The project is maintained at [USAR-FOSS/Quizza](https://github.com/USAR-FOSS/Quizza).

## Contributing

Open Source Week contributions should target
[USAR-FOSS/Quizza](https://github.com/USAR-FOSS/Quizza). Read
[CONTRIBUTING.md](CONTRIBUTING.md) for setup, contribution levels, and the theme
guide. Please follow our [Code of Conduct](CODE_OF_CONDUCT.md) and report
vulnerabilities privately using [SECURITY.md](SECURITY.md).
