import { describe, expect, it } from "vitest";
import { matchingTeamName, normalizeTeamNames, parseTeamCsv, searchTeams } from "./teams";

describe("team names", () => {
  it("deduplicates names regardless of case and repeated whitespace", () => {
    expect(normalizeTeamNames(["  Blue   Birds ", "blue birds", "Red", " red "]))
      .toEqual(["Blue Birds", "Red"]);
  });

  it("accepts only a configured team and preserves its host-facing name", () => {
    expect(matchingTeamName(["Blue Birds", "Red"], " blue  birds ")).toBe("Blue Birds");
    expect(matchingTeamName(["Blue Birds"], "Green")).toBeUndefined();
  });

  it("imports more than 1,000 CSV teams, including quoted commas and deduplicates", () => {
    const rows = Array.from({ length: 1200 }, (_, i) => `Team ${i + 1}`);
    const parsed = parseTeamCsv(`\uFEFFid,team_name\r\n0,"Blue, Birds"\r\n1,"blue, birds"\r\n${rows.map((name, i) => `${i + 2},${name}`).join("\r\n")}`);
    expect(parsed).toHaveLength(1201);
    expect(parsed[0]).toBe("Blue, Birds");
    expect(parsed.at(-1)).toBe("Team 1200");
  });

  it("searches team names without case sensitivity", () => {
    expect(searchTeams([{ name: "ALPHA" }, { name: "Beta" }], "alp"))
      .toEqual([{ name: "ALPHA" }]);
  });
});
