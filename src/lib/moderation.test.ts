import { describe, it, expect } from "vitest";
import { isClean } from "@/lib/moderation";

describe("isClean", () => {
  it("allows normal names and words", () => {
    expect(isClean("Alice")).toBe(true);
    expect(isClean("quiz master 42")).toBe(true);
  });

  it("blocks obvious profanity", () => {
    expect(isClean("shithead")).toBe(false);
  });

  it("catches simple leet and spacing evasion", () => {
    expect(isClean("f.u.c.k")).toBe(false);
    expect(isClean("sh1t")).toBe(false);
  });
});
