import { describe, it, expect } from "vitest";
import {
  canRevealAnswers,
  canShowLeaderboard,
  revealPolicy,
  leaderboardPolicy,
  participationMode,
} from "@/lib/quiz-policy";

describe("policy defaults", () => {
  it("defaults to per_question reveal, at_end leaderboard, one per device", () => {
    expect(revealPolicy({})).toBe("per_question");
    expect(leaderboardPolicy({})).toBe("at_end");
    expect(participationMode({})).toBe("one_per_device");
  });
});

describe("canRevealAnswers", () => {
  it("per_question is always visible", () => {
    expect(canRevealAnswers({ revealAnswers: "per_question" }, false)).toBe(true);
  });
  it("at_end only when the session is over", () => {
    expect(canRevealAnswers({ revealAnswers: "at_end" }, false)).toBe(false);
    expect(canRevealAnswers({ revealAnswers: "at_end" }, true)).toBe(true);
  });
  it("never is never", () => {
    expect(canRevealAnswers({ revealAnswers: "never" }, true)).toBe(false);
  });
});

describe("canShowLeaderboard", () => {
  it("at_end withholds while open, shows when over", () => {
    expect(canShowLeaderboard({ leaderboard: "at_end" }, false)).toBe(false);
    expect(canShowLeaderboard({ leaderboard: "at_end" }, true)).toBe(true);
  });
  it("never hides always", () => {
    expect(canShowLeaderboard({ leaderboard: "never" }, true)).toBe(false);
  });
});
