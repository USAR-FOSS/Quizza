# quizza

An open-source, no-login-needed live quiz and polling platform. A FOSS
alternative to Mentimeter. Build a quiz, share a room code, and let everyone play
from their phones. Built to self-host.

Status: early. The design system, data model, and quiz builder are in place. The
runtime (live and scheduled play) and host sign-in are next. See the roadmap.

## What it does

- Hosts build a quiz: multiple choice, true or false, poll, word cloud, scale,
  and open text questions.
- A quiz can run in two modes:
  - Live: host-driven, everyone synced to the same question.
  - Scheduled: open for a set window, taken self-paced.
- Players join with a nickname. No account required.
- Answers record accuracy and response time. Scoring rewards speed and accuracy,
  with a leaderboard.
- Host sign-in via FOSSClub OIDC is planned, to own and revisit quizzes.
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
| Realtime   | SSE + server actions        | see decision 0009 |

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
- [ ] Powerups, in-question multimedia, cheat-prevention hardening
- [ ] Results export

## License

To be decided. Intended to be a permissive open-source license.
