# Team email roster

Team email checks are optional and leave existing team quizzes unchanged. In
Quiz settings, turn on **Players choose a team**, choose 1–4 attempts per team,
then turn on **Check team members by email**. This also selects the signed-in
participation policy. Each team needs at least one listed email before launch.

With email checks enabled, add each member once as a team and email pair, one
per line. Team names are created from these rows automatically. Or import a
CSV with headers `Team Names,Emails` and one member per row:

```csv
Team Names,Emails
Blue Birds,alex@example.org
Blue Birds,sam@example.org
Red Foxes,lee@example.org
```

Header matching and roster email matching are case-insensitive. Quoted CSV
values are supported. Duplicate copies of the same email on one team are
collapsed; assigning one email to different teams is rejected. A team can list
more eligible emails than its attempt limit. For example, five members may be
listed for a team with one attempt, allowing any one of them to play. Each
join reserves an attempt permanently for that session, including after leaving
or finishing. The same account resumes its original attempt. Once the team's
limit is reached, other members see that its attempts are used. Removing a team also removes its roster
entries. Team and roster changes are blocked while a session is open.

At join, players sign in with FOSSClub, select a team, and type a listed email.
The server checks the email against that team before creating a participant.
The roster stays in host-only quiz settings and is never included in public
session details. Migration 0008 adds a nullable participant email and a unique
per-session index, so the same listed email cannot be claimed twice. Existing
participants remain unchanged. The full roster is stored in quiz settings JSON.

This is a **roster lookup, not proof of email ownership**. Someone with a
FOSSClub account who knows another member's listed address can claim it first.
Use an email one-time-code flow if ownership proof becomes necessary. Existing
account-level one-attempt protection still applies to rostered quizzes.
