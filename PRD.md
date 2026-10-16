## Product Vision Statement -

Quizza is a foss alternative to mentimeter, quizzr, and other quiz/test hosting apps, currently meant for GGSIPU East campus.
There are various college clubs here that would need/want this for the events they host. We want this to be the best free choice to host these quizzes across campus and even across scale later.

### PRD

Target users

-> UFC itself is the first user of this, we want to be able to host event quizzes/assignments on our own platform easily without worrying about it hitting limits, or it being not free or not stable.

It will then go on to 

-> Other clubs that exist at USAR
-> Other clubs at EDC
-> Other colleges
-> Anyone that wants to host a quiz/test

Use Cases

Stably being able to 
-> Create quizzes, host them, present them
-> Create assignments, tests and schedule them


User personas

Participant => I am told there is quiz being hosted on Quizza and I want to now attend it

Host => I want to host a quiz/test for whatever reason. I want to be able to create my own quiz, create my own requirements of data from the user, schedule it, see results as per time of answering and accuracy. Cheat prevention is something I'd be happy to have. A plus point would also be to be able to add some fun bits to my quizzes, like quests or fun things like having powerups like attack/shield/hint/etc in between quiz 

Admin => i am the admin with control over the interface and a primary key in case something goes wrong

Server Host => I am the server admin

Functional Requirements (with MVP in mind) -

- Allow participants to join a quiz anonly(enter username and select a fun pfp and voila)
- User SSO, sign in with fossclub.tech(oidc.fossclub.tech/)
- Quiz hosts can only create a quiz post login through SSO or creating an account(Email password)
- Quiz hosts can create a quiz, add questions of various types, set time for each question, set points for each questions
- Time and points otherwise have default preset options as per question type
- Quiz hosts can add the questions and schedule/save the quiz for later
- The quiz can go auto live(say a quiz host schedules it for 14th oct 8:00pm to 12:00am)
- Host can set the duration of the overall quiz or else that can be automatically calculated per question durations
- Only for that duration in a scheduled live event, will the quiz open per user after they click start anytime in between the time set by host.
- Hosts should be able to see the answered questions per all of the users as per their ranking by time and accuracy
- There should be an option to check the leaderboard after each question
- There should be an option to add powerups kind of things (Default powerups can include shield, attack, hint, etc)
- Option to add multimedia in questions
- Ability for the system to allow 10 quizzes to run in parallel with 1000 users each
- The max bottleneck to consider for now is 1000 users all submitting answer at the same time
- The UI/UX should be beautiful and smooth asf and shouldn't lag