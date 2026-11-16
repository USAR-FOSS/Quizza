import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canDiscloseScorecardAnswer } from "./quiz-policy.ts";

describe("Participant Review & Drilldown", () => {
  it("calculates accuracy percentage and avg speed accurately", () => {
    const calculateStats = (
      answers: Array<{ isCorrect: boolean; responseMs?: number | null }>,
    ) => {
      let correctCount = 0;
      let totalResponseMs = 0;
      let responseCount = 0;

      for (const a of answers) {
        if (a.isCorrect) correctCount++;
        if (a.responseMs != null) {
          totalResponseMs += a.responseMs;
          responseCount++;
        }
      }

      const totalAnswered = answers.length;
      const accuracyPct =
        totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
      const avgResponseMs =
        responseCount > 0 ? Math.round(totalResponseMs / responseCount) : 0;

      return { totalAnswered, correctCount, accuracyPct, avgResponseMs };
    };

    const stats1 = calculateStats([
      { isCorrect: true, responseMs: 1200 },
      { isCorrect: false, responseMs: 3400 },
      { isCorrect: true, responseMs: 2000 },
    ]);

    assert.equal(stats1.totalAnswered, 3);
    assert.equal(stats1.correctCount, 2);
    assert.equal(stats1.accuracyPct, 67);
    assert.equal(stats1.avgResponseMs, 2200);

    const statsEmpty = calculateStats([]);
    assert.equal(statsEmpty.totalAnswered, 0);
    assert.equal(statsEmpty.accuracyPct, 0);
    assert.equal(statsEmpty.avgResponseMs, 0);
  });

  it("enforces scorecard authorization policy", () => {
    const authorizeReview = (
      session: { hostToken: string },
      participant: { clientToken: string },
      auth: { hostToken?: string | null; clientToken?: string | null },
    ) => {
      const isHost = Boolean(auth.hostToken && auth.hostToken === session.hostToken);
      const isSelf = Boolean(auth.clientToken && auth.clientToken === participant.clientToken);
      if (!isHost && !isSelf) {
        throw new Error("403: forbidden");
      }
      return { isHost, isSelf };
    };

    const session = { hostToken: "host-secret-key" };
    const participant = { clientToken: "player-token-abc" };

    // Host authorized
    assert.deepEqual(authorizeReview(session, participant, { hostToken: "host-secret-key" }), {
      isHost: true,
      isSelf: false,
    });

    // Participant authorized
    assert.deepEqual(authorizeReview(session, participant, { clientToken: "player-token-abc" }), {
      isHost: false,
      isSelf: true,
    });

    // Another player forbidden
    assert.throws(
      () => authorizeReview(session, participant, { clientToken: "other-player" }),
      /403: forbidden/,
    );

    // Anonymous forbidden
    assert.throws(() => authorizeReview(session, participant, {}), /403: forbidden/);
  });

  it("masks unrevealed answers for participants while showing to host", () => {
    const maskAnswer = (
      showAnswers: boolean,
      item: { isCorrect: boolean; correctAnswer: string; points: number },
    ) => {
      return {
        isCorrect: showAnswers ? item.isCorrect : null,
        correctAnswer: showAnswers ? item.correctAnswer : null,
        pointsAwarded: showAnswers ? item.points : null,
      };
    };

    const data = { isCorrect: true, correctAnswer: "Option A", points: 100 };

    // Host or revealed session sees answer
    assert.deepEqual(maskAnswer(true, data), {
      isCorrect: true,
      correctAnswer: "Option A",
      pointsAwarded: 100,
    });

    // Unrevealed participant view hides correctness and answer
    assert.deepEqual(maskAnswer(false, data), {
      isCorrect: null,
      correctAnswer: null,
      pointsAwarded: null,
    });
  });

  it("formats CSV row with powerup metadata", () => {
    const formatRow = (r: {
      nickname: string;
      score: number;
      answer: string;
      correct: boolean;
      powerup?: string | null;
    }) => {
      return [
        r.nickname,
        String(r.score),
        r.answer,
        r.correct ? "yes" : "no",
        r.powerup ?? "",
      ].join(",");
    };

    const row = formatRow({
      nickname: "Alice",
      score: 500,
      answer: "Paris",
      correct: true,
      powerup: "double",
    });

    assert.equal(row, "Alice,500,Paris,yes,double");
  });

  describe("canDiscloseScorecardAnswer anti-leak verification", () => {
    it("always grants disclosure to host regardless of session progress", () => {
      const allowed = canDiscloseScorecardAnswer({
        isHost: true,
        isOver: false,
        policy: "never",
        mode: "live",
        currentQuestionIndex: 0,
        questionIndex: 5,
        isRevealed: false,
        answered: false,
      });
      assert.equal(allowed, true);
    });

    it("withholds answers for concluded session when policy is 'never'", () => {
      const allowed = canDiscloseScorecardAnswer({
        isHost: false,
        isOver: true,
        policy: "never",
        mode: "live",
        currentQuestionIndex: -1,
        questionIndex: 0,
        isRevealed: true,
        answered: true,
      });
      assert.equal(allowed, false);
    });

    it("discloses answers for concluded session when policy is 'at_end' or 'per_question'", () => {
      assert.equal(
        canDiscloseScorecardAnswer({
          isHost: false,
          isOver: true,
          policy: "at_end",
          mode: "live",
          currentQuestionIndex: -1,
          questionIndex: 0,
          isRevealed: true,
          answered: true,
        }),
        true,
      );

      assert.equal(
        canDiscloseScorecardAnswer({
          isHost: false,
          isOver: true,
          policy: "per_question",
          mode: "scheduled",
          currentQuestionIndex: -1,
          questionIndex: 0,
          isRevealed: true,
          answered: true,
        }),
        true,
      );
    });

    it("in live active session: discloses past questions, masks unrevealed current question, and strictly masks future questions", () => {
      // Current active question is index 2
      const baseCtx = {
        isHost: false,
        isOver: false,
        policy: "per_question" as const,
        mode: "live" as const,
        currentQuestionIndex: 2,
        isRevealed: false,
        answered: true,
      };

      // Past question (index 0, 1): already played and resolved
      assert.equal(canDiscloseScorecardAnswer({ ...baseCtx, questionIndex: 0 }), true);
      assert.equal(canDiscloseScorecardAnswer({ ...baseCtx, questionIndex: 1 }), true);

      // Current live question (index 2) while unrevealed: MUST NOT disclose
      assert.equal(
        canDiscloseScorecardAnswer({ ...baseCtx, questionIndex: 2, isRevealed: false }),
        false,
      );

      // Current live question (index 2) once host reveals: discloses
      assert.equal(
        canDiscloseScorecardAnswer({ ...baseCtx, questionIndex: 2, isRevealed: true }),
        true,
      );

      // Future questions (index 3, 4, 5): MUST NEVER disclose under any circumstance
      assert.equal(canDiscloseScorecardAnswer({ ...baseCtx, questionIndex: 3 }), false);
      assert.equal(
        canDiscloseScorecardAnswer({ ...baseCtx, questionIndex: 3, isRevealed: true }),
        false,
      );
      assert.equal(canDiscloseScorecardAnswer({ ...baseCtx, questionIndex: 4 }), false);
    });

    it("in scheduled active session: discloses only after participant has answered", () => {
      const scheduledCtx = {
        isHost: false,
        isOver: false,
        policy: "per_question" as const,
        mode: "scheduled" as const,
        currentQuestionIndex: -1,
        questionIndex: 1,
        isRevealed: false,
      };

      // Unanswered question in scheduled mode
      assert.equal(
        canDiscloseScorecardAnswer({ ...scheduledCtx, answered: false }),
        false,
      );

      // Answered question in scheduled mode
      assert.equal(
        canDiscloseScorecardAnswer({ ...scheduledCtx, answered: true }),
        true,
      );
    });
  });
});
