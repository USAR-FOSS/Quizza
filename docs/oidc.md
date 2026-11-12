# FOSSClub OIDC sign-in

Email/password host accounts work without OIDC. To enable FOSSClub, register a
confidential client with the provider operator and set:

```text
OIDC_ISSUER=https://oidc.fossclub.tech
OIDC_CLIENT_ID=<issued client id>
OIDC_CLIENT_SECRET=<issued secret>
```

Keep secrets in `.env.local` or the hosting platform's secret store. Docker
users must pass `--env-file .env.local` to Compose.

## Provider registration

Register the exact callback for each environment:

- Local: `http://localhost:3000/api/v1/auth/oidc/callback`
- Hosted: `https://<your-host>/api/v1/auth/oidc/callback`

The implementation uses FOSSClub's `/auth`, `/token`, and `/jwks` endpoints
relative to the issuer. It does not discover arbitrary providers. It requests
`openid profile email club`, uses authorization code with S256 PKCE and
`client_secret_basic`. ID tokens must use RS256 and pass issuer, audience,
signature, expiration, and nonce validation; the callback also checks state.

## Account identity and roster email

The provider subject identifies the account. Any supplied email must carry
`email_verified: true` before storage on the account, following
[OpenID Connect standard claims](https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims).
Team rosters separately check a player-entered email against the roster; they
do not prove ownership of that address. See [team roster limits](team-roster.md).

A matching email does not automatically link an existing password account or
another subject. The callback returns `oidc_account_conflict`; use the original
sign-in method or contact the instance operator. Authenticated account linking
is not implemented. Existing subject links remain; review historically linked
accounts separately if ownership is unclear.

## Verify the integration

Use a test client and database. Check new and returning identities, a conflicting
email account, an unverified email, and invalid state/nonce values. Verify that
post-login redirects stay on this app. A real provider registration is needed
to validate the complete external flow; unit tests do not prove compatibility.

Do not paste secrets, cookies, token responses, or registration transcripts
into docs or issue reports.
