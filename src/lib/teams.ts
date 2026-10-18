/** Keep team labels readable and deduplicate names regardless of case or spacing. */
export const MAX_TEAM_NAMES = 5000;
export const MAX_TEAM_NAME_LENGTH = 80;
export const MAX_TEAM_MEMBERS = 20000;
export const MAX_TEAM_EMAIL_LENGTH = 160;

export type TeamMember = { teamName: string; email: string };

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
function parseCsvRows(source: string): string[][] {
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
  return rows;
}

function header(value: string): string {
  return value.trim().toLowerCase().replace(/[ _-]+/g, " ");
}

export function parseTeamCsv(source: string): string[] {
  const rows = parseCsvRows(source);
  const headers = rows[0]?.map(header) ?? [];
  const column = headers.findIndex((value) => ["team", "team name", "name"].includes(value));
  const index = column < 0 ? 0 : column;
  return normalizeTeamNames(rows.slice(column < 0 ? 0 : 1).map((cells) => cells[index] ?? ""));
}

/** Two aligned manual columns: one team and one email per member row. */
export function parseTeamRosterColumns(teamColumn: string, emailColumn: string): TeamMember[] {
  const teams = teamColumn.replace(/\r/g, "").split("\n");
  const emails = emailColumn.replace(/\r/g, "").split("\n");
  const rows: TeamMember[] = [];
  for (let i = 0; i < Math.max(teams.length, emails.length); i++) {
    const teamName = teams[i]?.trim() ?? "";
    const email = emails[i]?.trim() ?? "";
    if (!teamName && !email) continue;
    if (!teamName || !email) throw new Error(`Row ${i + 1} needs both a team name and an email.`);
    rows.push({ teamName, email });
  }
  return rows;
}

/** Roster imports must name both columns, so a shifted file cannot misassign players. */
export function parseTeamRosterCsv(source: string): TeamMember[] {
  const rows = parseCsvRows(source);
  const headers = rows[0]?.map(header) ?? [];
  const teamColumn = headers.findIndex((value) => ["team", "team name", "team names"].includes(value));
  const emailColumn = headers.findIndex((value) => ["email", "emails", "email address"].includes(value));
  if (teamColumn < 0 || emailColumn < 0 || teamColumn === emailColumn)
    throw new Error("The CSV needs Team Names and Emails header columns.");
  return rows.slice(1).flatMap((cells, index) => {
    const teamName = cells[teamColumn]?.trim() ?? "";
    const email = cells[emailColumn]?.trim() ?? "";
    if (!teamName && !email && cells.every((cell) => !cell.trim())) return [];
    if (!teamName || !email) throw new Error(`CSV row ${index + 2} needs both a team name and an email.`);
    return [{ teamName, email }];
  });
}

export function normalizeTeamRoster(rows: TeamMember[], teamNames: string[], teamSize: number): TeamMember[] {
  if (rows.length > MAX_TEAM_MEMBERS) throw new Error(`A quiz can have up to ${MAX_TEAM_MEMBERS.toLocaleString()} rostered members.`);
  const teamLookup = new Map(normalizeTeamNames(teamNames).map((name) => [name.toLowerCase(), name]));
  const byEmail = new Map<string, string>();
  const counts = new Map<string, number>();
  const normalized: TeamMember[] = [];
  for (const row of rows) {
    const teamName = teamLookup.get(row.teamName.trim().replace(/\s+/g, " ").toLowerCase());
    if (!teamName) throw new Error(`Unknown team: ${row.teamName}`);
    const email = row.email.trim().toLowerCase();
    if (email.length > MAX_TEAM_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error(`Enter a valid email for ${teamName}.`);
    const previous = byEmail.get(email);
    if (previous) {
      if (previous.toLowerCase() !== teamName.toLowerCase())
        throw new Error(`${email} is assigned to more than one team.`);
      continue;
    }
    const count = (counts.get(teamName) ?? 0) + 1;
    if (count > teamSize) throw new Error(`${teamName} has more than ${teamSize} rostered members.`);
    counts.set(teamName, count);
    byEmail.set(email, teamName);
    normalized.push({ teamName, email });
  }
  return normalized;
}

export function rosterTeamForEmail(roster: TeamMember[], email: string): string | undefined {
  return roster.find((row) => row.email.trim().toLowerCase() === email.trim().toLowerCase())?.teamName;
}

export function searchTeams<T extends { name: string }>(teams: T[], query: string, limit = 50): T[] {
  const needle = query.trim().toLowerCase();
  return teams.filter((team) => team.name.toLowerCase().includes(needle)).slice(0, limit);
}

export function matchingTeamName(names: string[], requested: string): string | undefined {
  const key = requested.trim().replace(/\s+/g, " ").toLowerCase();
  return normalizeTeamNames(names).find((name) => name.toLowerCase() === key);
}
