import { describe, expect, it } from "vitest";
import { applyPowerup } from "./powerups";

describe("powerup scoring", () => {
  it("doubles earned points without awarding points for a wrong answer", () => {
    expect(applyPowerup(750, 1000, true, "double")).toBe(1500);
    expect(applyPowerup(0, 1000, false, "double")).toBe(0);
  });
  it("protects half the base score on a miss, without reducing a correct score", () => {
    expect(applyPowerup(0, 1000, false, "shield")).toBe(500);
    expect(applyPowerup(800, 1000, true, "shield")).toBe(800);
    expect(applyPowerup(0, 0, false, "shield")).toBe(0);
  });
});
