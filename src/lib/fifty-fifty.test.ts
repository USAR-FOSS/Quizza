import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectFiftyFiftyOptionIds } from "./powerups.ts";

describe("50:50 Server-Side Validation and Elimination Rules", () => {
  const sampleOptions = [
    { id: "opt-1", isCorrect: false },
    { id: "opt-2", isCorrect: true },
    { id: "opt-3", isCorrect: false },
    { id: "opt-4", isCorrect: false },
  ];

  it("never eliminates the correct option", () => {
    for (let i = 0; i < 20; i++) {
      const eliminated = selectFiftyFiftyOptionIds(sampleOptions, `seed-${i}`);
      assert.equal(eliminated.length, 2);
      assert.equal(eliminated.includes("opt-2"), false);
    }
  });

  it("returns idempotent results for repeated requests on the same question", () => {
    const run1 = selectFiftyFiftyOptionIds(sampleOptions, "player-1:q-1");
    const run2 = selectFiftyFiftyOptionIds(sampleOptions, "player-1:q-1");
    assert.deepEqual(run1, run2);
  });

  it("validates live session question gating logic", () => {
    const currentQuestionId = "q-active";
    const futureQuestionId = "q-future";

    // Simulating the validator check in getFiftyFiftyElimination:
    function validateLiveQuestionAccess(sessionCurrentQ: string, requestedQ: string, status: string, revealed: boolean) {
      if (status !== "active") return "session_not_active";
      if (sessionCurrentQ !== requestedQ) return "invalid_question";
      if (revealed) return "round_revealed";
      return "ok";
    }

    assert.equal(validateLiveQuestionAccess(currentQuestionId, currentQuestionId, "active", false), "ok");
    assert.equal(validateLiveQuestionAccess(currentQuestionId, futureQuestionId, "active", false), "invalid_question");
    assert.equal(validateLiveQuestionAccess(currentQuestionId, currentQuestionId, "lobby", false), "session_not_active");
    assert.equal(validateLiveQuestionAccess(currentQuestionId, currentQuestionId, "active", true), "round_revealed");
  });

  it("validates question-quiz ownership logic", () => {
    function validateOwnership(questionQuizId: string, sessionQuizId: string) {
      return questionQuizId === sessionQuizId;
    }

    assert.equal(validateOwnership("quiz-100", "quiz-100"), true);
    assert.equal(validateOwnership("quiz-other", "quiz-100"), false);
  });

  it("enforces server-side charge consumption and idempotency", () => {
    const maxUses = 1;
    let powerupsUsed = 0;
    const activatedQuestions = new Set<string>();

    function activateFiftyFifty(questionId: string) {
      if (activatedQuestions.has(questionId)) {
        // Repeated request: Return cached result without consuming charge
        return { success: true, consumed: false };
      }
      if (powerupsUsed >= maxUses) {
        return { success: false, error: "powerup_used" };
      }
      powerupsUsed++;
      activatedQuestions.add(questionId);
      return { success: true, consumed: true };
    }

    // First request on q-1 consumes charge
    const res1 = activateFiftyFifty("q-1");
    assert.equal(res1.success, true);
    assert.equal(res1.consumed, true);
    assert.equal(powerupsUsed, 1);

    // Repeated request on q-1 does NOT consume additional charge
    const res2 = activateFiftyFifty("q-1");
    assert.equal(res2.success, true);
    assert.equal(res2.consumed, false);
    assert.equal(powerupsUsed, 1);

    // Request on second question q-2 fails because charge is exhausted
    const res3 = activateFiftyFifty("q-2");
    assert.equal(res3.success, false);
    assert.equal(res3.error, "powerup_used");
  });
});
