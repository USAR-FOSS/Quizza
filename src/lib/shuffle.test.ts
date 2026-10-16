import { describe, it, expect } from "vitest";
import { seededShuffle } from "@/lib/shuffle";

describe("seededShuffle", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];

  it("is deterministic for the same seed", () => {
    expect(seededShuffle(items, "abc")).toEqual(seededShuffle(items, "abc"));
  });

  it("preserves all elements", () => {
    const out = seededShuffle(items, "xyz");
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it("does not mutate the input", () => {
    const copy = [...items];
    seededShuffle(items, "seed");
    expect(items).toEqual(copy);
  });

  it("usually differs between seeds", () => {
    expect(seededShuffle(items, "a")).not.toEqual(seededShuffle(items, "b"));
  });
});
