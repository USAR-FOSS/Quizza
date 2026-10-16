import { describe, expect, it } from "vitest";
import { csvField } from "./csv";

describe("spreadsheet exports", () => {
  it.each(["=1+1", "+cmd", "-cmd", "@SUM(A1)", "  =1", "\t=1", "\r=1"])(
    "neutralizes formula input %j",
    (value) => {
      expect(csvField(value)).toContain("'");
    },
  );
  it("quotes separators and embedded quotes", () => {
    expect(csvField('hello,"world"')).toBe('"hello,""world"""');
    expect(csvField("line\rbreak")).toBe('"line\rbreak"');
    expect(csvField(null)).toBe("");
    expect(csvField(-50)).toBe("-50");
  });
});
