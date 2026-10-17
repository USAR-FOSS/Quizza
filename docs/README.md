# quizza documentation

The documentation set for quizza, organized along the software lifecycle phases
from [strat.md](../strat.md). This page is the map; each document is the detail.

## The set

| Document | Phase | Purpose | Status |
|----------|-------|---------|--------|
| [PRD.md](../PRD.md) | Discovery and strategy | Product vision, personas, use cases, functional and non-functional requirements. | Living |
| [sdd.md](./sdd.md) | Architecture and design | System Design Document: C4 diagrams, components, workflows, data flows, non-functional requirements, deployment. | Living |
| [decisions.md](./decisions.md) | Architecture and design | Architecture Decision Records: sequential log of significant choices with context and status. | Living |
| [threat-model.md](./threat-model.md) | Architecture and design | STRIDE security analysis mapped onto the architecture, with mitigations and status. | Living |
| [data-dictionary.md](./data-dictionary.md) | Architecture and design | Schema design: every table, column, type, constraint, index, and relationship, plus JSONB sub-schemas. | Living |
| [deployment.md](./deployment.md) | Operations | Provider setup, environment variables, rollout, and rollback. | Living |
| [runbooks/realtime.md](./runbooks/realtime.md) | Operations | Realtime health checks, failure response, and load-test procedure. | Living |
| [realtime-scale-plan.md](./realtime-scale-plan.md) | Architecture and operations | Ordered implementation and acceptance plan for multi-instance live play. | Living |
| OpenAPI (`/api/v1/openapi.json`, UI at `/docs`) | Support and operations | API reference for the runtime and play surface, generated from the zod schemas. | Generated |

## How to read it

- New to the project: start with the [PRD](../PRD.md) for the why, then the
  [SDD](./sdd.md) for the how.
- Making a significant technical choice: append an entry to
  [decisions.md](./decisions.md). Do not rewrite past entries; supersede them.
- Changing the database: update `src/lib/db/schema.ts`, regenerate the migration,
  then reflect the change in [data-dictionary.md](./data-dictionary.md).
- Changing the API: the zod schemas in `src/lib/api/schemas.ts` drive both
  validation and the OpenAPI document, so the reference updates itself. Keep the
  route list in `src/lib/api/openapi.ts` in step with the handlers.
- Adding a feature with a security surface: check it against
  [threat-model.md](./threat-model.md) and add threats or mitigations.

## Diagrams

Diagrams use Mermaid and render in GitHub and most Markdown viewers. The SDD
carries the C4 context, container, and component views plus sequence and state
diagrams; the data dictionary carries the entity relationship diagram; the threat
model carries the trust-boundary diagram.

## Not yet written

These become relevant as the project matures (see strat.md for the full
lifecycle): release and deployment plan, master test plan, runbooks, disaster
recovery plan, and end-user documentation. They are intentionally deferred until
there is something to operate and ship.
