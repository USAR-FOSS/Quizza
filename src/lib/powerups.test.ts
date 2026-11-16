import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyPowerup,
  enabledPowerups,
  planAttackSettlements,
  powerupsLeft,
  selectFiftyFiftyOptionIds,
  type AttackAnswer,
} from "./powerups.ts";

describe("powerup scoring", () => {
  it("doubles earned points without awarding points for a wrong answer", () => {
    assert.equal(applyPowerup(750, 1000, true, "double"), 1500);
    assert.equal(applyPowerup(0, 1000, false, "double"), 0);
  });

  it("gives a safety net one third on a miss and keeps shields defensive", () => {
    assert.equal(applyPowerup(0, 1000, false, "safety_net"), 333);
    assert.equal(applyPowerup(800, 1000, true, "safety_net"), 800);
    assert.equal(applyPowerup(0, 1000, false, "shield"), 0);
    assert.equal(applyPowerup(500, 1000, true, "fifty_fifty"), 500);
  });

  it("excludes live-only powers from scheduled play while keeping 50:50", () => {
    assert.deepEqual(enabledPowerups({ powerups: true }, "scheduled"), [
      "double",
      "safety_net",
      "fifty_fifty",
    ]);
  });

  it("uses one shared charge pool across all powers", () => {
    assert.equal(powerupsLeft(2, ["shield"]), 1);
    assert.equal(powerupsLeft(2, ["shield", "double"]), 0);
  });

  it("settles attacks in a fixed order, with shields and no negative scores", () => {
    const time = new Date();
    const rows: AttackAnswer[] = [
      { id: "a1", participantId: "attacker1", powerup: "attack" as const, powerupTargetId: "victim", isCorrect: false, points: 0, createdAt: time },
      { id: "a2", participantId: "attacker2", powerup: "attack" as const, powerupTargetId: "victim", isCorrect: false, points: 0, createdAt: time },
      { id: "v", participantId: "victim", powerup: null, powerupTargetId: null, isCorrect: true, points: 100, createdAt: time },
    ];
    const result = planAttackSettlements(rows, [
      { id: "attacker1", score: 0 }, { id: "attacker2", score: 0 }, { id: "victim", score: 100 },
    ], 100);
    assert.deepEqual(result.outcomes.map((o) => o.stolen), [100, 0]);
    assert.equal(result.scores.get("victim"), 0);

    rows[2].powerup = "shield";
    const blocked = planAttackSettlements(rows, [
      { id: "attacker1", score: 0 }, { id: "attacker2", score: 0 }, { id: "victim", score: 100 },
    ], 100);
    assert.equal(blocked.outcomes.every((o) => o.blocked && o.stolen === 0), true);
  });

  it("takes a third from the target's existing balance on a miss, capped at zero", () => {
    const rows: AttackAnswer[] = [
      { id: "a", participantId: "attacker", powerup: "attack", powerupTargetId: "victim", isCorrect: true, points: 100, createdAt: new Date() },
      { id: "v", participantId: "victim", powerup: null, powerupTargetId: null, isCorrect: false, points: 0, createdAt: new Date() },
    ];
    const result = planAttackSettlements(rows, [
      { id: "attacker", score: 100 }, { id: "victim", score: 20 },
    ], 100);
    assert.equal(result.outcomes[0].stolen, 20);
    assert.equal(result.scores.get("victim"), 0);
    assert.equal(result.scores.get("attacker"), 120);
  });

  describe("selectFiftyFiftyOptionIds", () => {
    const fourOptions = [
      { id: "opt-1", isCorrect: false },
      { id: "opt-2", isCorrect: true },
      { id: "opt-3", isCorrect: false },
      { id: "opt-4", isCorrect: false },
    ];

    it("eliminates exactly two incorrect options", () => {
      const eliminated = selectFiftyFiftyOptionIds(fourOptions, "player-1");
      assert.equal(eliminated.length, 2);
      assert.equal(eliminated.includes("opt-2"), false); // Never eliminates the correct answer
      assert.equal(eliminated.every((id) => ["opt-1", "opt-3", "opt-4"].includes(id)), true);
    });

    it("is deterministic for identical seedKey", () => {
      const run1 = selectFiftyFiftyOptionIds(fourOptions, "player-test-seed");
      const run2 = selectFiftyFiftyOptionIds(fourOptions, "player-test-seed");
      assert.deepEqual(run1, run2);
    });

    it("returns empty array for questions with <= 2 options", () => {
      const twoOptions = [
        { id: "t", isCorrect: true },
        { id: "f", isCorrect: false },
      ];
      assert.deepEqual(selectFiftyFiftyOptionIds(twoOptions, "player-1"), []);
    });
  });
});
