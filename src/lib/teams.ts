/** Keep team labels readable and deduplicate names regardless of case or spacing. */
export const MAX_TEAM_NAMES = 5000;
export const MAX_TEAM_NAME_LENGTH = 80;

export function normalizeTeamNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => name.trim().replace(/\s+/g, " ")).filter((name) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Accept a one-column CSV or a named team/name column, including quoted commas. */
export function parseTeamCsv(source: string): string[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      row.push(field); rows.push(row); row = []; field = "";
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted value.");
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows[0]?.map((cell) => cell.trim().toLowerCase().replace(/[ _-]+/g, " ")) ?? [];
  const column = headers.findIndex((value) => ["team", "team name", "name"].includes(value));
  const index = column < 0 ? 0 : column;
  return normalizeTeamNames(rows.slice(column < 0 ? 0 : 1).map((cells) => cells[index] ?? ""));
}

export function searchTeams<T extends { name: string }>(teams: T[], query: string, limit = 50): T[] {
  const needle = query.trim().toLowerCase();
  return teams.filter((team) => team.name.toLowerCase().includes(needle)).slice(0, limit);
}

export function matchingTeamName(names: string[], requested: string): string | undefined {
  const key = requested.trim().replace(/\s+/g, " ").toLowerCase();
  return normalizeTeamNames(names).find((name) => name.toLowerCase() === key);
}
