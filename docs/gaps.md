# Functional gaps and hardening backlog

A grounded sweep of what is missing or wrong, prioritized. P0 = integrity or
correctness issues that undermine a real event; P1 = core completeness; P2 =
polish and growth. Each item notes the problem, the impact, and the fix.

## Shipped

Integrity bundle:

- Reveal and leaderboard policy are now per-quiz settings (`revealAnswers`,
  `leaderboard`), enforced in submit, the live snapshot, and results.
- Participation modes (`anonymous`, `one_per_device`, `signed_in`) with a
  `participants.user_id` / `device_id` schema change and unique indexes. The
  signed-in mode prevents replay (a second join returns the same attempt).
- P0-1: the results endpoint is gated. The host (host token) sees everything;
  participants are subject to policy and cannot read answers or standings while a
  quiz is open.
- P0-2: `POST /sessions` now requires the signed-in owner.
- A settings panel in the builder edits all of the above.

Hardening and completeness:

- P0-3: scheduled scoring is server-anchored via a signed per-question view token
  (`src/lib/view-token.ts`); client-reported time is only a fallback.
- P0-4: in-process rate limiting on join, submit, session-info, create, view, and
  login/register.
- P0-5: launch validation (every scorable question needs a prompt and exactly one
  correct option; option questions need two options).
- P1-2: scheduled attempts resume at the first unanswered question.
- P1-3: scheduled sessions lazily close after their window and free the code.
- P1-4: delete a quiz from the dashboard; sessions cascade.
- P1-6: deterministic shuffle of questions and options (per participant for
  scheduled, per session for live), toggled in settings.
- P2-2: a basic profanity screen on nicknames and text answers.
- P2-5: security headers (frame, nosniff, referrer, permissions); the OIDC client
  secret is redacted from docs; a vitest suite covers scoring, policy, shuffle,
  view tokens, and moderation.
- P2-6: host CSV export of all answers.

Verified end to end (unit tests plus integration tests). The items below remain.

## Deferred (needs infra or its own pass)

- Email verification and password reset: not planned. Host authentication is
  FOSSClub OIDC (no local email to verify). Email/password remains only as a
  simple fallback and does not need a verification or reset flow.
- P1-5 live host resilience (owner-fallback control), P2-1 authoring polish
  (option reorder, duplicate, preview), P2-3 host polish (QR, pause/extend, kick,
  cap), P2-4 role/member from OIDC, audit log, and analytics: each is a focused
  follow-up rather than part of this hardening pass.

## Highlighted by the user

### Answer and leaderboard visibility policy (currently hardcoded)

Today, reveal timing is fixed and not configurable:

- Scheduled mode: `submitAnswer` returns `isCorrect` and `correctOptionId` on
  every submission (`src/lib/sessions.ts`), so a player sees the right answer
  immediately after each question. No way to defer it.
- Live mode: the host reveals per question; there is no "reveal only at the end"
  or "never" option.
- `GET /sessions/{code}/results` returns per-option `isCorrect` with no gating
  (see P0-1), so answers leak regardless.

Fix: add per-quiz policy fields and enforce them everywhere answers can be seen.

```
QuizSettings.revealPolicy: "immediate" | "after_each" | "at_end" | "never"
QuizSettings.leaderboardPolicy: "live" | "after_each" | "at_end" | "hidden"
```

- `immediate`: current scheduled behavior (correctness returned on submit).
- `after_each`: live-style, shown when the question closes.
- `at_end`: correctness withheld until the player finishes (scheduled) or the
  session ends (live).
- `never`: correctness never shown to players; host still sees it.

Enforcement points: `submitAnswer` (omit `correctOptionId`/`isCorrect` unless
`immediate`), the live snapshot reveal step, and the results endpoint.

### Replay prevention (one attempt per person)

Problem: anonymous players can rejoin a session with a new nickname and play
again; nothing ties an attempt to a person. For graded assessments this is a
hole.

Fix: a per-quiz participation mode.

```
QuizSettings.participation: "anonymous" | "one_per_device" | "signed_in"
```

- `anonymous` (default): today's behavior.
- `one_per_device`: dedupe by a long-lived signed cookie; deters casual replay
  but is clearable, so document it as best-effort.
- `signed_in`: joining requires a signed-in account (OIDC or email/password);
  enforce one attempt per user with a unique index. This is the robust option
  and makes sign-in mandatory for that session, exactly as expected.

Schema: add `participants.user_id` (nullable FK to users) and a partial unique
index `(session_id, user_id)` for the signed-in case. The join flow and the
player UI gate on the mode.

## P0 - integrity and correctness

- **P0-1 Results endpoint leaks answers and is ungated.**
  `GET /sessions/{code}/results` returns the leaderboard and per-option
  `isCorrect` to anyone with the code, at any time (`results/route.ts`,
  `getResults`). During an open scheduled quiz this exposes every correct
  answer. Fix: require the host token for full results; for participants, return
  results only when the reveal/leaderboard policy allows (after they finish, or
  after the window closes), and strip `isCorrect` until then.
- **P0-2 `POST /sessions` is unauthenticated.** Anyone who knows a quiz UUID can
  start a session for it. The UI gates via the owner-checked `/present`, but the
  API does not. Fix: require the signed-in owner on `createSession`.
- **P0-3 Scheduled speed scoring trusts the client.** `elapsedMs` is
  client-reported and clamped only to the time limit, so the speed bonus is
  gameable. Fix: issue a signed, server-timestamped per-question view token when
  the player fetches a question; compute `response_ms` server-side from it.
- **P0-4 No rate limiting anywhere.** Join, submit, results, join-code lookup,
  and login have no limits, so join flooding, six-digit code brute force, and
  password guessing are all open. Fix: per-IP and per-session limits on those
  routes.
- **P0-5 Launch validation is thin.** A scorable question with no correct option
  marked scores everyone as wrong; nothing warns the host. Fix: validate on
  launch that every scorable question has exactly one correct option and a
  prompt.

## P1 - core completeness

- **P1-1 No quiz-settings UI.** `shuffleQuestions`, `shuffleOptions`,
  `showLeaderboard`, `allowLateJoin` exist in the schema but are never edited or
  applied. Add a settings panel in the builder and wire the settings into the
  runtime (option/question shuffling, leaderboard visibility, late join). Fold in
  the new reveal/leaderboard/participation policies here.
- **P1-2 Scheduled attempt cannot resume.** A refresh mid-quiz restarts at
  question 1; already-answered questions 409 and are skipped, which is rough.
  Persist per-participant progress and resume at the right question.
- **P1-3 Scheduled sessions never close.** After `closes_at`, status stays
  `active`; openness is only computed. Lazily mark `ended` (and free the code) on
  access after the window, or a periodic sweep.
- **P1-4 No quiz or session management.** No delete quiz, no list of a quiz's
  past or active sessions, no way to end a scheduled session early. Add to the
  dashboard and the builder.
- **P1-5 Live host resilience.** The host token lives only in `localStorage`; if
  it is cleared or the host switches devices, the session is orphaned with no way
  to control or end it. Consider tying host control to the signed-in owner as a
  fallback to the token.
- **P1-6 Shuffle not applied.** Even once editable, question and option order is
  fixed at runtime. Apply per-participant shuffle for scheduled, per-session for
  live.

## P2 - experience, accounts, ops

- **P2-1 Authoring:** option reordering, question duplication, and a
  play-as-participant preview.
- **P2-2 Participant polish:** clear "you already played / already answered"
  messaging; let a finished participant review their own answers; nickname and
  word-cloud moderation (profanity filter, since both are shown publicly).
- **P2-3 Host polish:** QR code for joining on the big screen; pause or extend a
  question; kick a participant; a participant cap.
- **P2-4 Accounts:** email verification and password reset for email/password
  accounts; use the OIDC `role`/`member` claims (admin role, member-only
  option); session revocation.
- **P2-5 Security/ops:** security headers (CSP, frame options); redact the client
  secret from `docs/oidc.md`; an audit log of host actions; an automated test
  suite (there is none today, which is a real risk for a platform meant to be
  stable).
- **P2-6 Results/data:** CSV/JSON export; per-participant drill-down for the
  host; basic analytics.

## Suggested order

1. The integrity bundle (P0-1, P0-2, plus the reveal and participation policies
   and the settings UI that houses them). These are tightly coupled: results
   gating, reveal timing, and replay prevention all turn on quiz settings and a
   small schema change.
2. P0-5 launch validation and P1-2 resume, which make real runs trustworthy.
3. P0-3 and P0-4 (anti-cheat hardening) before any high-stakes assessment.
4. P1 management and P2 polish as capacity allows.
