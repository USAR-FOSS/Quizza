import { describe, expect, it } from "vitest";
import { matchingTeamName, normalizeTeamNames, normalizeTeamRoster, parseTeamCsv, parseTeamRosterColumns, parseTeamRosterCsv, rosterTeamForEmail, searchTeams } from "./teams";

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

  it("maps aligned manual team and email columns", () => {
    expect(parseTeamRosterColumns("Blue\nBlue\nRed\n", "a@example.org\nb@example.org\nc@example.org\n"))
      .toEqual([
        { teamName: "Blue", email: "a@example.org" },
        { teamName: "Blue", email: "b@example.org" },
        { teamName: "Red", email: "c@example.org" },
      ]);
    expect(() => parseTeamRosterColumns("Blue\nRed", "a@example.org"))
      .toThrow("Row 2 needs both");
  });

  it("imports a roster CSV by named columns and preserves row mapping", () => {
    const rows = Array.from({ length: 1200 }, (_, i) => `Team ${i + 1},player${i + 1}@example.org`);
    const parsed = parseTeamRosterCsv(`\uFEFFEmails,Team Names,ID\r\n"CAPTAIN@example.org","Blue, Birds",1\r\n${rows.map((row, i) => {
      const [team, email] = row.split(",");
      return `${email},${team},${i + 2}`;
    }).join("\r\n")}`);
    expect(parsed).toHaveLength(1201);
    expect(parsed[0]).toEqual({ teamName: "Blue, Birds", email: "CAPTAIN@example.org" });
    expect(parsed.at(-1)).toEqual({ teamName: "Team 1200", email: "player1200@example.org" });
    expect(() => parseTeamRosterCsv("Team Names\nBlue"))
      .toThrow("Team Names and Emails");
  });

  it("deduplicates roster emails case-insensitively and rejects conflicting teams or capacity", () => {
    const roster = normalizeTeamRoster([
      { teamName: " blue ", email: "  A@EXAMPLE.ORG " },
      { teamName: "BLUE", email: "a@example.org" },
      { teamName: "Red", email: "b@example.org" },
    ], ["Blue", "Red"], 2);
    expect(roster).toEqual([
      { teamName: "Blue", email: "a@example.org" },
      { teamName: "Red", email: "b@example.org" },
    ]);
    expect(rosterTeamForEmail(roster, " A@example.org ")).toBe("Blue");
    expect(() => normalizeTeamRoster([
      { teamName: "Blue", email: "a@example.org" },
      { teamName: "Red", email: "A@example.org" },
    ], ["Blue", "Red"], 2)).toThrow("more than one team");
    expect(() => normalizeTeamRoster([
      { teamName: "Blue", email: "a@example.org" },
      { teamName: "Blue", email: "b@example.org" },
    ], ["Blue"], 1)).toThrow("more than 1");
  });
});
