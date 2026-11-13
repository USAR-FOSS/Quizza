# Contributing to Quizza

All issues, discussions, and pull requests belong in
[USAR-FOSS/Quizza](https://github.com/USAR-FOSS/Quizza). Push branches to your own
fork and target upstream `main` when opening a PR.

## 1. Choose a task

| Starting point | What to expect |
| --- | --- |
| [Good first issues](https://github.com/USAR-FOSS/Quizza/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue) | A bounded change with concrete starting files and checks |
| [Intermediate](https://github.com/USAR-FOSS/Quizza/issues?q=is%3Aissue%20is%3Aopen%20label%3Aintermediate) | A feature or integration across a few parts of the app |
| [Complex](https://github.com/USAR-FOSS/Quizza/issues?q=is%3Aissue%20is%3Aopen%20label%3Acomplex) | Persistence, identity, realtime, or architecture work |
| [Documentation](https://github.com/USAR-FOSS/Quizza/issues?q=is%3Aissue%20is%3Aopen%20label%3Adocumentation) | Guides, reproducible examples, and operational knowledge |
| [Design required](https://github.com/USAR-FOSS/Quizza/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22design%20required) | Agree on behavior and failure cases before implementation |

Read the acceptance criteria and linked dependencies. Check open PRs for overlap,
then comment with your intended scope and how you will verify it. Pick one task
at a time. For a small well-defined issue, the issue discussion is enough; larger
policy or architecture changes start with a focused Discussion linked to the issue.

The [direction RFC](https://github.com/USAR-FOSS/Quizza/discussions/53) and
[milestones](https://github.com/USAR-FOSS/Quizza/milestones) explain priorities.
An idea can be valuable without belonging in the current PR.

## 2. Fork and run the app

Fork USAR-FOSS/Quizza on GitHub, then use your fork's clone URL:

```bash
git clone https://github.com/YOUR_USERNAME/Quizza.git
cd Quizza
git remote add upstream https://github.com/USAR-FOSS/Quizza.git
git fetch upstream
git switch -c feat/ISSUE-short-description upstream/main
```

Continue with [local setup](docs/development.md#local-setup). Complete the
[two-browser smoke check](docs/development.md#first-smoke-check) before changing
runtime behavior. You can work on docs without setting up a database, but execute
any setup or API commands you change before claiming they work.

Read [AGENTS.md](AGENTS.md). For Next.js changes, read the relevant guide in
`node_modules/next/dist/docs/` before coding; this version has breaking changes.

## 3. Open the right guide

The [documentation map](docs/README.md#find-the-right-reference) routes you by
area: authoring, sessions, auth, teams, API, data, or deployment.

- Adding a palette: use the [theme guide](docs/contributing/themes.md).
- Changing schema: follow the [database workflow](docs/development.md#database-changes)
  and update the [data dictionary](docs/data-dictionary.md).
- Changing API behavior: keep handlers, [schemas](src/lib/api/schemas.ts),
  [OpenAPI](src/lib/api/openapi.ts), and client types in agreement.
- Changing identity, visibility, or tokens: read the [threat model](docs/threat-model.md).
  Report an actual vulnerability privately through [SECURITY.md](SECURITY.md).
- Changing realtime: use the [runbook](docs/runbooks/realtime.md), including
  cross-instance and recovery checks.

## 4. Validate the change

Use the [validation checklist](docs/development.md#validation). Add regression
coverage for changed logic and authorization; use screenshots and keyboard checks
for small visual changes. Do not add tests that only repeat implementation details.
For docs-only changes, verify links, terminology, and any commands or examples you
changed. Explain checks you could not run.

Use plain language. Do not add emojis or em dashes to code, comments, docs, or
commit messages. Preserve attribution and third-party notices. Do not include
secrets, build output, unrelated formatting, or local planning/backlog artifacts.

## 5. Open the pull request

Commit the focused change and push your branch to your fork:

```bash
git push -u origin HEAD
```

Open a PR with base **USAR-FOSS/Quizza:main** and your fork branch as the head.
Link the issue, explain the user-visible result, and record validation. Use
`Closes #NUMBER` only when the whole issue is complete; otherwise use `Refs #NUMBER`.
Describe migrations, configuration changes, compatibility, and limitations that
reviewers need to assess. Use a draft PR when you want feedback before completion.

Respond to review in the same PR. Resolve the agreed scope before taking another
task. Maintainers merge after review; a Vercel preview authorization request is
not a reason to publish secrets or change deployment settings.

## Questions and conduct

Use [Discussions](https://github.com/USAR-FOSS/Quizza/discussions) for questions
and proposals, and issues for reproducible bugs or agreed work. If you are unsure
where to start, ask on an issue or contact siddharthb@fossunited.org.
Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Contributions use [Apache-2.0](LICENSE). Submit work you have the right to
contribute. You can begin directly with Quizza; Open Source Week's broader
Dimsee → Quizza → sedim path is an optional learning progression, not a dependency
between the codebases.
