# Scheduled Practice Session Recipe

Use a scheduled Quizza session to let learners complete a short practice quiz independently within a defined time window. Unlike a live quiz, participants do not need to answer together.

> **Purpose:** Self-paced practice and revision. This is not a proctored assessment or a replacement for an LMS assignment.

## 1. Create a Practice Quiz

Create a quiz titled **Computer Science Fundamentals — Practice**.

Use these original sample questions:

1. Which data structure follows the LIFO principle?
   - Queue
   - Stack
   - Linked List
   - Graph

   **Correct answer:** Stack

2. What is the time complexity of binary search on a sorted array?
   - O(n)
   - O(n²)
   - O(log n)
   - O(1)

   **Correct answer:** O(log n)

3. Which SQL command retrieves records from a table?
   - INSERT
   - UPDATE
   - SELECT
   - DELETE

   **Correct answer:** SELECT

4. Which protocol is commonly used to transfer web pages?
   - FTP
   - HTTP
   - SMTP
   - SSH

   **Correct answer:** HTTP

5. Which of the following is a programming language?
   - HTML
   - CSS
   - Python
   - JSON

   **Correct answer:** Python

## 2. Configure the Quiz Settings

Open **Quiz settings** and configure the following:

- **Show correct answers: At the end**
  - Scheduled learners receive feedback after completing their own attempt, rather than having to wait for the entire session to close.
  - Choose **After each question** if you want immediate feedback after every submitted answer.
  - Choose **Never** if learners should not see correct answers.

- **Show leaderboard: Hidden**
  - Learners do not see leaderboard standings.
  - **After each live round** and **At the end** are other available policies. In scheduled sessions, standings become available to a learner after they finish when the selected policy permits it.

- **Who can play: One try per device**
  - Uses a device cookie as a best-effort replay restriction.
  - Alternatively, **Anyone, anonymous** allows nickname-based participation and retries.
  - **Signed in, one try** requires an account and limits participation to one attempt per person.

Save the settings.

## 3. Schedule the Practice Session

1. Open the quiz's launch screen.
2. Select **Scheduled** instead of Live.
3. Set the opening date and time.
4. Set the closing date and time.
5. Create the session and share its join code or link with learners.

The closing time must be later than the opening time and in the future.

## 4. Understand the Learner Experience

Consider two fictional learners:

- **Ava** joins at 10:00 AM and completes all five questions at 10:20 AM. With the recommended answer-release setting, she can review her permitted results after finishing her own attempt.
- **Noah** joins at 10:10 AM, answers two questions, and refreshes the page. He can resume his existing attempt on the same device and continue from his saved progress.

The session behaves as follows:

| Session stage | Learner experience |
|---|---|
| Before opening | The session is not available for joining or answering. |
| During the window | Learners can join, answer at their own pace, and resume an existing attempt. |
| After an individual finishes | Results and leaderboard visibility follow the selected policies. |
| After closing | The session ends and new answers are no longer accepted. |

## 5. Resuming an Attempt

Scheduled sessions preserve participant identity and answered-question progress.

If a learner refreshes or returns during the open window, Quizza restores the existing attempt when the same participant identity is recognized through the original account or device.

For signed-in participation, the learner must return using the account that originally joined.

A learner cannot submit new answers after the scheduled session closes.

## 6. Important Limitations

Scheduled practice sessions are designed for independent practice, not formal assessment.

Quizza does not turn this workflow into a full LMS assignment system. Do not assume it provides assignment distribution, gradebook integration, individual due-date management, or proctoring.

The scheduled window controls when learners can participate; it does not establish that a learner completed the work independently or without assistance.

## 7. Verify the Workflow

For a basic manual check, use two separate browser profiles:

1. Open the session link before its opening time. Confirm that joining is blocked.
2. Wait until the opening time and join using the first profile.
3. Join using the second profile.
4. Answer some questions in the first profile.
5. Refresh the first profile and verify that the attempt resumes.
6. Finish the first profile's attempt and check its permitted feedback.
7. Keep the second profile unfinished and verify that it does not receive the first learner's private feedback.
8. Wait until the closing time and verify that new answers are rejected.

**Note:** Complete this two-profile walkthrough before marking manual verification as passed.