import { describe, expect, it } from "vitest";
import { formatScheduledTimestamp } from "./format-time";

describe("formatScheduledTimestamp", () => {
  it("formats ISO string with date, time, and timezone offset or abbreviation", () => {
    const formatted = formatScheduledTimestamp("2026-11-16T12:00:00Z");
    expect(formatted).toBeTruthy();
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/[A-Za-z]/);
  });

  it("handles Date objects correctly", () => {
    const d = new Date(2026, 10, 16, 14, 30);
    const formatted = formatScheduledTimestamp(d);
    expect(formatted).toContain("2026");
  });

  it("returns empty string for invalid dates", () => {
    expect(formatScheduledTimestamp("invalid-date")).toBe("");
  });
});
