# Security policy

## Reporting

Send vulnerabilities privately to siddharthb@fossunited.org with "Quizza security"
in the subject. Include the affected commit, configuration, reproduction steps,
expected behavior, and impact. Use test accounts and redact cookies, bearer
tokens, roster emails, and deployment secrets.

Do not open public issues or PRs containing exploits or real participant data.
Coordinate disclosure with the maintainer after a fix is available. Response
times are not guaranteed; follow up if you have not heard back in a week.

## Supported code

Quizza is pre-1.0. Fixes target the maintained development line in USAR-FOSS/Quizza;
older commits do not have separate support branches. Include your exact commit
because the default branch may lag development. Review upgrade notes and apply
migrations when updating.

## Deployment boundaries

Generate a private `AUTH_SECRET` and keep it stable across instances. Use HTTPS,
restricted database/Redis access, and separate development and production
credentials. Keep QStash signature verification enabled for public live rooms.

Device cookies are not strong identity. Scheduled timing does not prevent looking
up answers. Uploaded media is public by unguessable URL. Quizza is not a proctored
examination system. See the [threat model](docs/threat-model.md) and
[current gaps](docs/gaps.md).

OIDC accounts use provider subjects. Email claims must be verified; matching
emails do not automatically link accounts. Previously auto-linked accounts need
operator review if their origin is in doubt. Password reset, local email
verification, explicit linking, and session revocation remain future work.
