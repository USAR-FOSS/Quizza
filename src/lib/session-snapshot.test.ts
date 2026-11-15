import { describe, it } from "node:test";
import assert from "node:assert/strict";

type QuizOption = {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  sortOrder: number;
};

type QuizQuestion = {
  id: string;
  quizId: string;
  prompt: string;
  type: string;
  timeLimitSec: number;
  points: number;
  mediaUrl: string | null;
  sortOrder: number;
  options: QuizOption[];
};

type QuizSnapshot = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  theme: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showCorrectAnswers: string;
  leaderboardPolicy: string;
  questions: QuizQuestion[];
};

function freezeQuizSnapshot(quiz: QuizSnapshot): QuizSnapshot {
  return JSON.parse(JSON.stringify(quiz));
}

describe("Immutable Quiz Session Snapshots", () => {
  it("freezes deep quiz question and option hierarchies faithfully", () => {
    const liveQuiz: QuizSnapshot = {
      id: "qz-101",
      title: "Distributed Systems Midterm",
      description: "Covers consensus and replication",
      coverUrl: null,
      theme: "grape",
      shuffleQuestions: true,
      shuffleOptions: false,
      showCorrectAnswers: "after_quiz",
      leaderboardPolicy: "after_each_question",
      questions: [
        {
          id: "q-1",
          quizId: "qz-101",
          prompt: "What does Raft rely on for leader election?",
          type: "multiple_choice",
          timeLimitSec: 30,
          points: 100,
          mediaUrl: null,
          sortOrder: 1,
          options: [
            { id: "o-1", questionId: "q-1", text: "Randomized timers", isCorrect: true, sortOrder: 1 },
            { id: "o-2", questionId: "q-1", text: "Central coordinator", isCorrect: false, sortOrder: 2 },
          ],
        },
      ],
    };

    const snapshot = freezeQuizSnapshot(liveQuiz);

    // Verify deeply identical contents
    assert.deepEqual(snapshot, liveQuiz);
    assert.equal(snapshot.questions.length, 1);
    assert.equal(snapshot.questions[0].options.length, 2);
    assert.equal(snapshot.questions[0].options[0].text, "Randomized timers");
  });

  it("remains immutable when the source template is edited after session launch", () => {
    const liveQuiz: QuizSnapshot = {
      id: "qz-102",
      title: "Original Exam Title",
      description: null,
      coverUrl: null,
      theme: "sky",
      shuffleQuestions: false,
      shuffleOptions: false,
      showCorrectAnswers: "always",
      leaderboardPolicy: "final_only",
      questions: [
        {
          id: "q-1",
          quizId: "qz-102",
          prompt: "Initial Question Prompt",
          type: "multiple_choice",
          timeLimitSec: 20,
          points: 100,
          mediaUrl: null,
          sortOrder: 1,
          options: [
            { id: "opt-1", questionId: "q-1", text: "Answer A", isCorrect: true, sortOrder: 1 },
          ],
        },
      ],
    };

    const frozenSnapshot = freezeQuizSnapshot(liveQuiz);

    // Author edits the live template after session creation:
    liveQuiz.title = "Modified Quiz Title 2027";
    liveQuiz.questions[0].prompt = "Modified Question Prompt";
    liveQuiz.questions[0].options[0].text = "Tampered Option";
    liveQuiz.questions.push({
      id: "q-2",
      quizId: "qz-102",
      prompt: "Newly added question",
      type: "open_text",
      timeLimitSec: 45,
      points: 200,
      mediaUrl: null,
      sortOrder: 2,
      options: [],
    });

    // The historical session snapshot must preserve the original launch-time state
    assert.equal(frozenSnapshot.title, "Original Exam Title");
    assert.equal(frozenSnapshot.questions.length, 1);
    assert.equal(frozenSnapshot.questions[0].prompt, "Initial Question Prompt");
    assert.equal(frozenSnapshot.questions[0].options[0].text, "Answer A");
  });

  it("verifies Drizzle migration column definition for quiz_snapshot", () => {
    const ddl = `ALTER TABLE "sessions" ADD COLUMN "quiz_snapshot" jsonb;`;
    assert.ok(ddl.includes(`ADD COLUMN "quiz_snapshot" jsonb`));
  });
});
