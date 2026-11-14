# Quizza

Self-hosted live quizzes and polls for clubs, classrooms, and community events.
Hosts create a quiz, share a room code, and let everyone join from their phones.
Players can join without accounts when the host allows it. Hosts need an account.

## Start here

| I want to... | Go to |
| --- | --- |
| Run Quizza locally and try a quiz | [Development setup](docs/development.md) |
| Make a contribution | [Contributing](CONTRIBUTING.md) |
| Host a real event | [Deployment](docs/deployment.md), then the [realtime runbook](docs/runbooks/realtime.md) |
| Understand the direction | [Direction RFC](https://github.com/USAR-FOSS/Quizza/discussions/53) and [milestones](https://github.com/USAR-FOSS/Quizza/milestones) |
| Find a technical reference | [Documentation map](docs/README.md) |
| Report a vulnerability | [Security policy](SECURITY.md) |

## What works today

- Six question types: multiple choice, true or false, poll, word cloud, scale,
  and open text.
- Live host-led rooms and scheduled self-paced sessions.
- Quiz authoring, themes, question media, team rosters, and configurable powerups.
- Email/password host accounts and optional FOSSClub OIDC sign-in.
- Server-timed scoring, reconnect recovery, reveal and leaderboard policies,
  and CSV/JSON results.
- A playable local `/demo` and owner-only quiz previews.

See [current capabilities and limits](docs/gaps.md) for detail. The concurrency
numbers in the PRD are targets, not measured capacity claims. Roster email lookup
is not proof of email ownership, and scheduled play is not proctoring.

## Run it

Use **Node 24**, **pnpm 12.4.1**, and **Postgres**. The default local mode does not
need Redis, QStash, or OIDC credentials.

Follow [the setup guide](docs/development.md#local-setup) for clone, environment,
database, and start commands. It also covers
[Docker](docs/development.md#docker), a two-browser smoke check, and common setup
errors. Fonts are bundled locally, so builds do not download them.

The application uses Next.js 16 / React 19, TypeScript, Tailwind CSS, Drizzle and
Postgres. Production realtime uses Redis and QStash. Read
[deployment requirements](docs/deployment.md) before opening a public room.

## Contribute during Open Source Week

The path is **README → [CONTRIBUTING](CONTRIBUTING.md) → an issue → the relevant
[guide](docs/README.md) → a focused pull request**.

Start with [good first issues](https://github.com/USAR-FOSS/Quizza/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue) or browse the
[full contributor backlog](https://github.com/USAR-FOSS/Quizza/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted).
Each task has a difficulty, topic, acceptance criteria, and milestone. Comment
with your approach before starting. Pull requests and issues belong in
**USAR-FOSS/Quizza**; push your branch to your own fork.

Our direction is reliable events and self-hosting first, classroom assignments
and feedback next, then broader participation and integrations. The
[RFC](https://github.com/USAR-FOSS/Quizza/discussions/53) explains the ordering
and invites feedback. Milestones are capabilities, not release-date promises.

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Copyright 2026 Quizza contributors. Licensed under [Apache-2.0](LICENSE).
Bundled fonts retain their [SIL OFL licenses](src/app/fonts/README.md).
