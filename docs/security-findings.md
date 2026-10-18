# Security and bug findings

This document records the issues confirmed during the review of Quizza and tracks their resolution.

## Confirmed findings and resolutions

### 1. OIDC sign-in can preserve an attacker-controlled password account

**Severity:** Medium — account takeover / persistent unauthorized access

Registration allows an account to be created with an email address and password without proving control of that email. Later, the OIDC callback associates an identity with an existing account by matching the email. The callback previously did not remove the existing password credential or revoke sessions already issued to that account. An attacker could therefore pre-register a victim's email, then retain password-based access after the victim signs in through OIDC.

**Status:** Resolved.

**Remediation implemented:**
- Required proof of authentication to the existing account before linking: unauthenticated OIDC sign-in attempts against an existing password account are rejected with `oidc_account_exists`.
- Rejected account association collisions across different provider identities (`oidc_account_conflict`).
- Added `session_version` to the `users` schema (migration `0009_far_terror.sql`) and included version verification in JWT session tokens.
- Added `revokeUserSessions` in `src/lib/auth.ts`, called during account linking to invalidate any pre-existing sessions issued to that account.

**Affected code:**
- `src/lib/actions/auth.ts`
- `src/app/api/v1/auth/oidc/callback/route.ts`
- `src/lib/auth.ts`
- `src/components/auth/auth-form.tsx`

---

### 2. OIDC `next` parameter permits an external redirect using ASCII control characters

**Severity:** Low — open redirect after successful authentication

The OIDC start, callback, and login-page checks rejected common external URL forms such as `//host`, but allowed a slash followed by a tab, line feed, or carriage return and another slash. URL parsing strips these control characters, turning such a value into a protocol-relative external URL.

**Status:** Resolved.

**Remediation implemented:**
- Introduced `sanitizeRedirectPath` in `src/lib/auth.ts` to strictly validate local redirect destinations.
- Strips/rejects ASCII control characters (`[\x00-\x1F\x7F]`), protocol-relative URLs (`//`), backslashes, and external origins before resolving paths.
- Applied `sanitizeRedirectPath` consistently across `src/app/api/v1/auth/oidc/start/route.ts`, `src/app/api/v1/auth/oidc/callback/route.ts`, and `src/app/login/page.tsx`.
- Added unit tests covering tabs, newlines, control characters, and protocol URLs in `src/lib/auth.test.ts`.

---

### 3. Attack powerup progress metadata can reveal answer correctness before the configured reveal

**Severity:** Low — answer correctness side-channel

The progress response hides correctness and points while results are not meant to be visible (`never` or unfinished `at_end` reveal modes), but still exposed `attackStolen` and `attackedLoss`. Attack transfers depend on correctness: a correct answer can transfer the full amount, while an incorrect answer is capped at roughly one third. A participant who could observe these values could infer whether the attacked participant answered correctly.

**Status:** Resolved.

**Remediation implemented:**
- Updated `getProgress` in `src/lib/sessions.ts` to mask `attackStolen`, `attackBlocked`, and `attackedLoss` with `visible`. When answers are not yet revealed according to quiz policy, all attack outcome fields are masked (returning `0`, `false`, `0`).
- Added regression unit tests in `src/lib/sessions.test.ts`.

---

### 4. Malformed team CSV quoting can silently alter imported values

**Severity:** Low — data integrity / import correctness

The CSV parser previously accepted malformed quote placement and stripped quotes in a way that could silently change imported team labels. For example, a quote appearing inside an unquoted field could be accepted rather than rejected as malformed input.

**Status:** Resolved.

**Remediation implemented:**
- Updated `parseCsvRows` in `src/lib/teams.ts` to strictly validate quote boundaries and reject unescaped or misplaced quotes with an explicit error.
- Verified with regression test cases in `src/lib/teams.test.ts`.

---

### 5. RootLayout TypeScript compilation error

**Severity:** Low — build / type-checking failure

In `src/app/layout.tsx`, `RootLayout` declared its props as `LayoutProps<"/">`, which was not imported or globally declared, causing `tsc --noEmit` and production builds to fail with error `TS2304: Cannot find name 'LayoutProps'`.

**Status:** Resolved.

**Remediation implemented:**
- Replaced `LayoutProps<"/">` with `Readonly<{ children: React.ReactNode }>`.

---

## Documented design limitations (not counted as additional confirmed vulnerabilities)

- Team-roster email entry is a lookup mechanism and is not proof of mailbox ownership; this is documented in `docs/team-roster.md`.
- Scheduled quiz prompts/options may be returned before the timer starts; this is documented in `docs/gaps.md`.

## Test and verification status

- **Unit tests:** Vitest suite passes (21 test files, 120 tests).
- **TypeScript:** `tsc --noEmit` passes with 0 errors.
- **Lint:** ESLint passes with 0 errors or warnings.
- **Production build:** Next.js production build (`next build`) generates all static pages and dynamic routes with 0 errors.
