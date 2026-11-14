# HTTP API cookbook

This cookbook provides recipes, fixtures, and reference examples for interacting
with the Quizza runtime HTTP API (`/api/v1`). It is intended for external
integrations, test automation, and local scripting.

For interactive exploration, open the Scalar reference at `/docs` or fetch the raw
OpenAPI 3.1 specification at `/api/v1/openapi.json`.

---

## Architecture and stability boundaries

Before calling endpoints, understand the boundary between the public REST API and
internal Next.js Server Actions:

1. **Versioned REST API (`/api/v1/*`)**:
   - The supported external contract for sessions, participant registration,
     question retrieval, answer submissions, live control, and results export.
   - Built with versioned route handlers and documented using OpenAPI 3.1.
   - Standard JSON request/response formats and explicit HTTP status codes.

2. **Server Actions (`src/lib/actions/*`) are NOT an external API**:
   - Server Actions handle internal UI state for the quiz builder, autosave,
     account sign-in, and draft previews.
   - They use React Server Components (RSC) RPC transport with opaque internal headers
     (`Next-Action`) and non-standard serialization.
   - Server Actions are not versioned, not included in the OpenAPI document, and
     subject to breaking changes between internal framework builds without notice.
   - External tools, automations, and third-party scripts must never call Server
     Actions directly. Use only the `/api/v1` routes documented below.

---

## Disposable local fixtures

Use the following fixtures to test against a local development server running at
`http://localhost:3000`. These fixtures represent a self-paced scheduled quiz session.

### Fixture identifiers

| Entity | Field | Fixture value |
| --- | --- | --- |
| User (Host) | `id` | `00000000-0000-4000-8000-000000000001` |
| Quiz | `id` | `11111111-1111-4111-8111-111111111111` |
| Question | `id` | `22222222-2222-4222-8222-222222222222` |
| Option (Correct) | `id` | `33333333-3333-4333-8333-333333333331` |
| Option (Wrong) | `id` | `33333333-3333-4333-8333-333333333332` |
| Session | `id` | `44444444-4444-4444-8444-444444444444` |
| Session | `code` | `948201` |
| Session | `hostToken` | `mock_host_token_0123456789abcdef` |
| Participant | `id` | `55555555-5555-4555-8555-555555555555` |
| Participant | `clientToken` | `mock_client_token_fedcba9876543210` |

### SQL seed script for local development

To seed a local PostgreSQL database (such as the Docker container described in
[development.md](development.md)), run this script using `psql` or a database tool:

```sql
-- 1. Create a mock test host user
INSERT INTO users (id, email, name, role)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'host-fixture@example.test',
  'Test Host',
  'host'
) ON CONFLICT (id) DO NOTHING;

-- 2. Create a test quiz template
INSERT INTO quizzes (id, owner_id, title, cover_icon, theme, settings)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000001',
  'API Cookbook Scheduled Demo',
  'terminal',
  'grape',
  '{"revealAnswers": "per_question", "leaderboard": "per_question", "participation": "anonymous"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 3. Create a test multiple-choice question
INSERT INTO questions (id, quiz_id, position, type, prompt, time_limit_sec, points, settings)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  0,
  'multiple_choice',
  'Which header passes the participant credential?',
  30,
  1000,
  '{"speedBonus": true}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 4. Create choices for the question
INSERT INTO options (id, question_id, position, label, is_correct, color)
VALUES
  ('33333333-3333-4333-8333-333333333331', '22222222-2222-4222-8222-222222222222', 0, 'x-client-token', true, 'candy-berry'),
  ('33333333-3333-4333-8333-333333333332', '22222222-2222-4222-8222-222222222222', 1, 'Authorization: Bearer', false, 'candy-citrus')
ON CONFLICT (id) DO NOTHING;

-- 5. Create an active scheduled session open for 24 hours
INSERT INTO sessions (
  id, quiz_id, code, mode, status, host_token, opens_at, closes_at
)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  '948201',
  'scheduled',
  'active',
  'mock_host_token_0123456789abcdef',
  NOW() - INTERVAL '1 hour',
  NOW() + INTERVAL '23 hours'
) ON CONFLICT (id) DO UPDATE SET status = 'active', opens_at = NOW() - INTERVAL '1 hour', closes_at = NOW() + INTERVAL '23 hours';
```

### Cleanup script

To purge the test fixtures after your test run:

```sql
DELETE FROM sessions WHERE id = '44444444-4444-4444-8444-444444444444';
DELETE FROM quizzes WHERE id = '11111111-1111-4111-8111-111111111111';
DELETE FROM users WHERE id = '00000000-0000-4000-8000-000000000001';
```

---

## Endpoint recipes

### 1. Room lookup

Fetches public room metadata for display on join screens. It reveals the quiz title,
theme, participant count, mode, and requirements. It never reveals answers,
unmasked question details, or host tokens.

#### Request

```bash
curl -s -X GET "http://localhost:3000/api/v1/sessions/948201" \
  -H "Accept: application/json"
```

#### Success response (`200 OK`)

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "code": "948201",
  "mode": "scheduled",
  "status": "active",
  "opensAt": "2026-11-14T05:00:00.000Z",
  "closesAt": "2026-11-15T05:00:00.000Z",
  "participantCount": 0,
  "participation": "anonymous",
  "teams": [],
  "teamSize": null,
  "teamEmailVerification": false,
  "powerups": false,
  "powerupUses": 0,
  "powerupTypes": [],
  "quiz": {
    "title": "API Cookbook Scheduled Demo",
    "coverIcon": "terminal",
    "theme": "grape",
    "coverImage": null,
    "iconImage": null
  }
}
```

#### Error responses

- **`404 Not Found` (Unknown code or session ended)**:
  ```json
  {
    "error": {
      "code": "session_not_found",
      "message": "Session not found"
    }
  }
  ```

- **`429 Too Many Requests` (Rate limit exceeded)**:
  ```json
  {
    "error": {
      "code": "rate_limited",
      "message": "Too many requests. Try again in 45s."
    }
  }
  ```

---

### 2. Participant join

Registers a new participant in the room. Returns the participant profile and a
persistent `clientToken`. The participant must store this `clientToken` locally
(for example, in browser local storage or memory) and pass it on subsequent requests
to submit answers and view progress.

#### Request

```bash
curl -s -X POST "http://localhost:3000/api/v1/sessions/948201/participants" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "nickname": "Ada Lovelace",
    "avatarColor": "sky"
  }'
```

#### Success response (`201 Created`)

```json
{
  "id": "55555555-5555-4555-8555-555555555555",
  "nickname": "Ada Lovelace",
  "teamName": null,
  "avatarColor": "sky",
  "avatarUrl": null,
  "clientToken": "mock_client_token_fedcba9876543210"
}
```

#### Error responses

- **`409 Conflict` (Session closed or not open)**:
  ```json
  {
    "error": {
      "code": "session_not_open",
      "message": "This session is not open right now"
    }
  }
  ```

- **`409 Conflict` (Session ended)**:
  ```json
  {
    "error": {
      "code": "session_ended",
      "message": "This session has ended"
    }
  }
  ```

- **`409 Conflict` (Team full)**:
  ```json
  {
    "error": {
      "code": "team_full",
      "message": "Team Alpha has already used all 4 allowed attempts for this quiz."
    }
  }
  ```

- **`422 Unprocessable Content` (Inappropriate nickname)**:
  ```json
  {
    "error": {
      "code": "nickname_rejected",
      "message": "Please choose a different nickname"
    }
  }
  ```

- **`422 Unprocessable Content` (Validation failure)**:
  ```json
  {
    "error": {
      "code": "validation_error",
      "message": "Request failed validation",
      "details": [
        {
          "code": "too_small",
          "minimum": 1,
          "type": "string",
          "inclusive": true,
          "exact": false,
          "message": "String must contain at least 1 character(s)",
          "path": ["nickname"]
        }
      ]
    }
  }
  ```

---

### 3. Scheduled question list and view timer

Scheduled sessions allow self-paced completion within an open window.

#### Step 3A: List scheduled questions

Fetches all questions in the quiz. Notice that `isCorrect` is stripped from every
option to prevent answer harvesting.

```bash
curl -s -X GET "http://localhost:3000/api/v1/sessions/948201/questions" \
  -H "Accept: application/json" \
  -H "x-client-token: mock_client_token_fedcba9876543210"
```

##### Success response (`200 OK`)

```json
{
  "answered": [],
  "usedPowerups": [],
  "questions": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "position": 0,
      "type": "multiple_choice",
      "prompt": "Which header passes the participant credential?",
      "mediaUrl": null,
      "timeLimitSec": 30,
      "points": 1000,
      "settings": {
        "speedBonus": true
      },
      "options": [
        {
          "id": "33333333-3333-4333-8333-333333333331",
          "position": 0,
          "label": "x-client-token",
          "color": "candy-berry"
        },
        {
          "id": "33333333-3333-4333-8333-333333333332",
          "position": 1,
          "label": "Authorization: Bearer",
          "color": "candy-citrus"
        }
      ]
    }
  ]
}
```

##### Error responses

- **`401 Unauthorized` (Missing or invalid client token)**:
  ```json
  {
    "error": {
      "code": "missing_token",
      "message": "A participant client token is required"
    }
  }
  ```

- **`409 Conflict` (Attempting scheduled question list on a live session)**:
  ```json
  {
    "error": {
      "code": "not_scheduled",
      "message": "This endpoint is for scheduled sessions"
    }
  }
  ```

#### Step 3B: Start or resume question view timer

Before submitting an answer in scheduled mode, the participant client requests a
`viewToken`. The server records the first view timestamp in the database (`question_views`)
and issues a signed token. Subsequent requests return the original `startedAt` timestamp,
preventing client timer resets across page reloads.

```bash
curl -s -X GET "http://localhost:3000/api/v1/sessions/948201/questions/22222222-2222-4222-8222-222222222222/view" \
  -H "Accept: application/json" \
  -H "x-client-token: mock_client_token_fedcba9876543210"
```

##### Success response (`200 OK`)

```json
{
  "viewToken": "mock_view_token_eyJzZXNzaW9uSWQiOiI0NDQ0NDQ0NC00NDQ0LTQ0NDQtODQ0NC00NDQ0NDQ0NDQ0NDQifQ.mock_signature",
  "startedAt": "2026-11-14T06:15:00.000Z"
}
```

##### Error responses

- **`404 Not Found` (Unknown question)**:
  ```json
  {
    "error": {
      "code": "question_not_found",
      "message": "Question not found"
    }
  }
  ```

- **`401 Unauthorized` (Token missing or participant unknown)**:
  ```json
  {
    "error": {
      "code": "invalid_token",
      "message": "Unknown participant"
    }
  }
  ```

---

### 4. Submitting an answer

Submits a single answer. In scheduled mode, supply the `viewToken` obtained in
Step 3B. In live mode, response timing is calculated server-side from when the host
opened the question.

#### Request

```bash
curl -s -X POST "http://localhost:3000/api/v1/sessions/948201/answers" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "questionId": "22222222-2222-4222-8222-222222222222",
    "clientToken": "mock_client_token_fedcba9876543210",
    "optionId": "33333333-3333-4333-8333-333333333331",
    "viewToken": "mock_view_token_eyJzZXNzaW9uSWQiOiI0NDQ0NDQ0NC00NDQ0LTQ0NDQtODQ0NC00NDQ0NDQ0NDQ0NDQifQ.mock_signature"
  }'
```

#### Success response (`200 OK`)

When the quiz settings specify `revealAnswers: "per_question"`, correctness and
points are returned immediately:

```json
{
  "accepted": true,
  "revealed": true,
  "isCorrect": true,
  "pointsAwarded": 980,
  "correctOptionId": "33333333-3333-4333-8333-333333333331"
}
```

When the quiz settings specify `revealAnswers: "at_end"` or `"never"`, the response
records the answer silently:

```json
{
  "accepted": true,
  "revealed": false,
  "isCorrect": null,
  "pointsAwarded": null,
  "correctOptionId": null
}
```

#### Error responses

- **`409 Conflict` (Already answered)**:
  ```json
  {
    "error": {
      "code": "already_answered",
      "message": "You have already answered this question"
    }
  }
  ```

- **`409 Conflict` (Time limit expired)**:
  ```json
  {
    "error": {
      "code": "question_expired",
      "message": "Time is up for this question"
    }
  }
  ```

- **`422 Unprocessable Content` (Missing or forged view token in scheduled mode)**:
  ```json
  {
    "error": {
      "code": "invalid_view_token",
      "message": "Open the question before answering"
    }
  }
  ```

- **`422 Unprocessable Content` (Option does not belong to question)**:
  ```json
  {
    "error": {
      "code": "invalid_option",
      "message": "That option is not part of this question"
    }
  }
  ```

---

### 5. Authorized results and leaderboard

Retrieves the session leaderboard and aggregated question statistics.

Access rules:
- **Host with `Authorization: Bearer <hostToken>`**: Receives full statistics,
  correct answer indicators, and complete leaderboard ranks even while the session
  is running.
- **Participant with `x-client-token: <clientToken>`**: Receives results only if
  the participant has completed all questions or the session has ended, subject to
  quiz reveal policies.
- **Unauthenticated**: Receives results only after the session has ended and the quiz
  configuration permits public display.

#### Request (as host)

```bash
curl -s -X GET "http://localhost:3000/api/v1/sessions/948201/results" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer mock_host_token_0123456789abcdef"
```

#### Success response (`200 OK`)

```json
{
  "totalParticipants": 1,
  "over": false,
  "showAnswers": true,
  "showBoard": true,
  "leaderboard": [
    {
      "participantId": "55555555-5555-4555-8555-555555555555",
      "nickname": "Ada Lovelace",
      "teamName": null,
      "avatarColor": "sky",
      "avatarUrl": null,
      "score": 980,
      "rank": 1
    }
  ],
  "questionStats": [
    {
      "questionId": "22222222-2222-4222-8222-222222222222",
      "prompt": "Which header passes the participant credential?",
      "mediaUrl": null,
      "type": "multiple_choice",
      "responses": 1,
      "options": [
        {
          "optionId": "33333333-3333-4333-8333-333333333331",
          "label": "x-client-token",
          "count": 1,
          "isCorrect": true
        },
        {
          "optionId": "33333333-3333-4333-8333-333333333332",
          "label": "Authorization: Bearer",
          "count": 0,
          "isCorrect": false
        }
      ],
      "textValues": [],
      "numberAverage": null
    }
  ]
}
```

#### Error responses

- **`404 Not Found` (Unknown session code)**:
  ```json
  {
    "error": {
      "code": "session_not_found",
      "message": "Session not found"
    }
  }
  ```

---

### 6. Authorized CSV export

Downloads a raw CSV attachment containing every recorded answer in the session.

Security controls:
- **Host authentication**: Requires `Authorization: Bearer <hostToken>`. The token
  must never be sent via a query parameter in URLs to avoid logging secrets in proxies
  or web history.
- **Formula injection protection**: Text fields that begin with `=`, `+`, `-`, or `@`
  are automatically prefixed with `'` to prevent malicious spreadsheet formula execution.

#### Request

```bash
curl -s -i -X GET "http://localhost:3000/api/v1/sessions/948201/export" \
  -H "Authorization: Bearer mock_host_token_0123456789abcdef"
```

#### Success response (`200 OK`)

```http
HTTP/1.1 200 OK
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="quizza-948201.csv"
Cache-Control: private, no-store

nickname,team,score,question,answer,correct,response_ms,points
Ada Lovelace,,980,Which header passes the participant credential?,x-client-token,yes,600,980
```

#### Error responses

- **`403 Forbidden` (Missing or invalid bearer token)**:
  ```json
  {
    "error": {
      "code": "forbidden",
      "message": "Host token required"
    }
  }
  ```

- **`404 Not Found` (Session code not found)**:
  ```json
  {
    "error": {
      "code": "session_not_found",
      "message": "Session not found"
    }
  }
  ```

---

## Standard error envelope and status codes

All `/api/v1` JSON endpoints return errors using a standardized schema:

```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "Human readable summary",
    "details": []
  }
}
```

### Common HTTP status codes

| HTTP Status | Error code | Typical cause |
| --- | --- | --- |
| `400 Bad Request` | `invalid_json` | Malformed JSON in request payload |
| `401 Unauthorized` | `missing_token` | Required `x-client-token` or Bearer token omitted |
| `401 Unauthorized` | `invalid_token` | Token is syntactically invalid or participant not found |
| `401 Unauthorized` | `signin_required` | Action requires a signed-in host or participant |
| `403 Forbidden` | `forbidden` | Missing or invalid `hostToken` for host-only routes |
| `404 Not Found` | `session_not_found` | Session join code does not match any existing session |
| `404 Not Found` | `question_not_found` | Target question ID does not belong to the session |
| `404 Not Found` | `participant_not_found` | Token does not resolve to a participant in this room |
| `409 Conflict` | `session_not_open` | Scheduled window is in the future or in the past |
| `409 Conflict` | `session_ended` | Session has been terminated by the host |
| `409 Conflict` | `already_answered` | Question has already been answered by this participant |
| `409 Conflict` | `question_expired` | Time limit elapsed before submission was received |
| `409 Conflict` | `not_current_question` | Live session is on a different question |
| `409 Conflict` | `team_full` | Chosen team has reached maximum participant capacity |
| `422 Unprocessable Content` | `validation_error` | Request body failed schema constraints (see `details`) |
| `422 Unprocessable Content` | `nickname_rejected` | Nickname rejected by content moderation filter |
| `422 Unprocessable Content` | `invalid_view_token` | Scheduled view token missing, invalid, or forged |
| `422 Unprocessable Content` | `invalid_option` | Chosen `optionId` does not belong to this question |
| `429 Too Many Requests` | `rate_limited` | Caller exceeded IP or token rate limit window |
| `500 Internal Error` | `internal_error` | Unexpected server error |

---

## Current host-auth model and limitations

Understanding how Quizza authenticates hosts is critical for architects and developers:

1. **Monolithic bearer tokens**:
   - When a session is created, the system generates a 32-character high-entropy
     token (`sessions.hostToken`).
   - This single token is all-or-nothing: whoever holds it has full administrative
     power, including advancing questions, triggering reveals, ending the room,
     reading results, and downloading the full CSV export.
   - It cannot be scoped (for example, you cannot create a read-only presenter token
     for an auditorium screen that prevents session termination or data export).

2. **Plaintext database storage**:
   - `sessions.host_token` is currently stored in plaintext in PostgreSQL to allow
     token recovery by the authenticated quiz owner.
   - Mitigations rely entirely on database access controls and network isolation.

3. **Session creation tied to user browser cookies**:
   - The session creation endpoint (`POST /api/v1/sessions`) validates the user
     through `getCurrentUser()`, which reads the `quizza_session` HTTP-only cookie.
   - There are currently no machine-to-machine API keys or personal access tokens (PATs)
     for creating sessions from unattended command-line scripts or CI/CD pipelines
     without first simulating an interactive cookie session.

---

## Roadmap: future scoped credentials

Work is planned to address current host credential limitations. The future design
will separate presenter, administrative, and export capabilities:

- **Capability-scoped tokens**:
  - `sessions:control` for starting, pausing, and advancing rounds.
  - `sessions:present` for read-only projection screens (SSE stream and answer ticks).
  - `sessions:export` for auditing and CSV data extraction.
- **Hashed token storage**:
  - Storing only salted hashes (such as SHA-256) of host and export tokens in the database.
- **Machine API keys and Personal Access Tokens (PATs)**:
  - First-class API keys allowing programmatic quiz creation, session scheduling,
    and webhook subscription outside interactive browser sessions.

For related architectural notes and open items, consult:
- [Threat model: trust boundaries and credential storage](threat-model.md#1-scope-and-assets)
- [Design decisions: ADR 0011 (API surface and OpenAPI)](decisions.md#0011---api-surface-and-documentation-rest-plus-openapi)
- [Design decisions: ADR 0014 (Host authentication)](decisions.md#0014---host-authentication-oidc-and-emailpassword)
- [Current implementation and remaining gaps](gaps.md#infrastructure-and-integrity-limits)
