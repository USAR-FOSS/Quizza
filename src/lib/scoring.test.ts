import { describe, it, expect } from "vitest";
import { computePoints, clampResponseMs } from "@/lib/scoring";

describe("computePoints", () => {
  const base = { basePoints: 1000, timeLimitSec: 20, responseMs: 0, speedBonus: false };

  it("gives 0 for non-scorable questions", () => {
    expect(computePoints({ ...base, scorable: false, isCorrect: true })).toBe(0);
  });

  it("gives 0 for a wrong answer", () => {
    expect(computePoints({ ...base, scorable: true, isCorrect: false })).toBe(0);
  });

  it("gives full points for a correct answer without speed bonus", () => {
    expect(computePoints({ ...base, scorable: true, isCorrect: true })).toBe(1000);
  });

  it("gives full points for an instant correct answer with speed bonus", () => {
    expect(
      computePoints({ ...base, scorable: true, isCorrect: true, speedBonus: true, responseMs: 0 }),
    ).toBe(1000);
  });

  it("never drops below half with speed bonus at the time limit", () => {
    expect(
      computePoints({ ...base, scorable: true, isCorrect: true, speedBonus: true, responseMs: 20000 }),
    ).toBe(500);
  });

  it("scales between full and half", () => {
    const p = computePoints({ ...base, scorable: true, isCorrect: true, speedBonus: true, responseMs: 10000 });
    expect(p).toBeGreaterThan(500);
    expect(p).toBeLessThan(1000);
  });
});

describe("clampResponseMs", () => {
  it("returns null for missing values", () => {
    expect(clampResponseMs(null, 20)).toBeNull();
    expect(clampResponseMs(undefined, 20)).toBeNull();
  });
  it("clamps to the time limit and floors at 0", () => {
    expect(clampResponseMs(-5, 20)).toBe(0);
    expect(clampResponseMs(999999, 20)).toBe(20000);
  });
});
