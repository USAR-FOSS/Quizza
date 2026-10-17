// Prepare distinct real participants for a dedicated live load-test room.
// Usage: BASE_URL=... ROOM_CODE=... COUNT=1002 node scripts/load/prepare.mjs
import { readFile, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL?.replace(/\/$/, "");
const code = process.env.ROOM_CODE;
const count = Number(process.env.COUNT ?? 52);
const output = process.env.PLAYERS_FILE ?? "scripts/load/live.players.json";
const delayMs = Number(process.env.JOIN_DELAY_MS ?? 50);
if (!base || !/^https?:\/\//.test(base) || !code || !Number.isInteger(count) || count < 1 || !Number.isFinite(delayMs) || delayMs < 0) {
  throw new Error("Set BASE_URL, ROOM_CODE, COUNT, and a nonnegative JOIN_DELAY_MS");
}

const infoResponse = await fetch(`${base}/api/v1/sessions/${encodeURIComponent(code)}`);
if (!infoResponse.ok) throw new Error(`Room lookup failed (${infoResponse.status})`);
const info = await infoResponse.json();
if (info.mode !== "live" || info.status !== "lobby" || info.participation === "signed_in") {
  throw new Error("Use a dedicated live room in the lobby with anonymous/device participation");
}

let fixture = { base, code, players: [] };
try {
  fixture = JSON.parse(await readFile(output, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (fixture.base !== base || fixture.code !== code ||
    !Array.isArray(fixture.players) ||
    fixture.players.some((p) => typeof p?.clientToken !== "string")) {
  throw new Error("Player file belongs to another room or is invalid; choose a new PLAYERS_FILE");
}
const players = fixture.players;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (let i = players.length; i < count; i++) {
  let response;
  for (;;) {
    response = await fetch(`${base}/api/v1/sessions/${encodeURIComponent(code)}/participants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: `Load ${String(i + 1).padStart(4, "0")}` }),
    });
    if (response.status !== 429) break;
    await pause(65_000);
  }
  if (!response.ok) throw new Error(`Join ${i + 1} failed (${response.status}): ${await response.text()}`);
  const player = await response.json();
  players.push({ clientToken: player.clientToken });
  await writeFile(output, `${JSON.stringify(fixture)}\n`, { mode: 0o600 });
  if ((i + 1) % 25 === 0 || i + 1 === count) console.log(`Prepared ${i + 1}/${count}`);
  if (i + 1 < count) await pause(delayMs);
}
console.log(`Ready: ${players.length} participant tokens in ${output}`);
