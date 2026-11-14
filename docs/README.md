# Quizza documentation

Choose a guide for the task in front of you. You do not need to read the full
architecture specification before making a focused contribution.

## Entry points

| Your goal | Start here | Next |
| --- | --- | --- |
| First contribution | [CONTRIBUTING](../CONTRIBUTING.md) | [Local setup](development.md#local-setup), then your issue's files |
| Run or debug locally | [Development setup](development.md) | [Troubleshooting](development.md#troubleshooting) |
| Self-host a public event | [Deployment](deployment.md) | [Realtime operations](runbooks/realtime.md) and [upgrades](upgrade.md) |
| Understand the product direction | [Direction RFC](https://github.com/USAR-FOSS/Quizza/discussions/53) | [Milestones](https://github.com/USAR-FOSS/Quizza/milestones) and [current gaps](gaps.md) |
| Report a sensitive issue | [Security policy](../SECURITY.md) | Private maintainer contact |

## Find the right reference

| Area | Guide or contract | Code entry points |
| --- | --- | --- |
| Themes and visual changes | [Theme guide](contributing/themes.md) | `src/lib/quiz-constants.ts`, `src/components/live/room-theme.tsx`, `src/app/globals.css` |
| Quiz authoring | [System design](sdd.md), [current capabilities](gaps.md) | `src/components/builder/`, `src/lib/actions/quiz.ts`, `src/lib/quiz-access.ts` |
| Live and scheduled play | [System design](sdd.md), [realtime runbook](runbooks/realtime.md) | `src/lib/sessions.ts`, `src/lib/realtime/`, `src/components/live/` |
| Scoring and powerups | [Design decisions](decisions.md) and adjacent tests | `src/lib/scoring.ts`, `src/lib/powerups.ts`, `src/lib/realtime/settlement.ts` |
| Accounts and OIDC | [OIDC setup](oidc.md), [threat model](threat-model.md) | `src/lib/auth.ts`, `src/lib/actions/auth.ts`, `src/app/api/v1/auth/oidc/` |
| Team eligibility | [Team roster behavior](team-roster.md) | `src/lib/teams.ts`, `src/lib/sessions.ts`, `src/components/live/team-picker.tsx` |
| Database and migrations | [Data dictionary](data-dictionary.md), [database workflow](development.md#database-changes) | `src/lib/db/schema.ts`, `src/lib/db/schema-types.ts`, `drizzle/` |
| HTTP API | [API cookbook](api-cookbook.md), runtime `/docs` and `/api/v1/openapi.json` | `src/lib/api/schemas.ts`, `src/lib/api/openapi.ts`, `src/lib/api-client.ts`, `src/app/api/v1/` |
| Deployment and recovery | [Deployment](deployment.md), [runbook](runbooks/realtime.md), [upgrade notes](upgrade.md) | `Dockerfile`, `docker-compose.yml`, `scripts/vercel-build.mjs` |
| Capacity | [Scale plan](realtime-scale-plan.md), [load procedure](runbooks/realtime.md#load-test) | `scripts/load/`, `scripts/integration/two-instance.mjs` |

## Architecture and history

- [PRD](../PRD.md): the original campus-focused product intent and requirements.
- [System Design Document](sdd.md): architecture, data flows, and diagrams.
- [Architecture decisions](decisions.md): recorded choices and their context.
- [Threat model](threat-model.md): security boundaries and remaining work.
- [Data dictionary](data-dictionary.md): tables, constraints, and JSON settings.
- [Current gaps](gaps.md): what is implemented and what is still limited.
- [Upgrade notes](upgrade.md): migrations and behavior changes for operators.

The RFC and issue milestones organize proposed future work. They do not mean a
feature is implemented. PR descriptions identify changes still awaiting review;
current source and tests are the implementation reference. The historical
[software lifecycle outline](../strat.md) is background reading, not an onboarding
prerequisite.

## Keep the path useful

Link new guides from the relevant row above. Keep setup commands in
[development.md](development.md) and deployment instructions in
[deployment.md](deployment.md) rather than copying them into every document.
Schema changes should update the data dictionary; behavior changes should update
upgrade notes when operators need to act. Supersede architecture decisions with
new entries instead of rewriting their history.

End-user guides, backup rehearsal, and API examples have their own
[documentation issues](https://github.com/USAR-FOSS/Quizza/issues?q=is%3Aissue%20is%3Aopen%20label%3Adocumentation).
They are work to complete, not links to documents that do not yet exist.
