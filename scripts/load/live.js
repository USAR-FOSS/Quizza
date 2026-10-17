// k6 with the k6/x/sse extension. Use a disposable quiz with exactly ROUNDS questions.
// BASE_URL, ROOM_CODE, HOST_TOKEN, PLAYERS_FILE, STAGE_PLAYERS are required.
import http from "k6/http";
import sse from "k6/x/sse";
import { sleep, fail } from "k6";
import { SharedArray } from "k6/data";
import { Counter, Rate, Trend } from "k6/metrics";

const base = (__ENV.BASE_URL || "").replace(/\/$/, "");
const code = __ENV.ROOM_CODE || "";
const hostToken = __ENV.HOST_TOKEN || "";
const playerCount = Number(__ENV.STAGE_PLAYERS || 50);
const rounds = Number(__ENV.ROUNDS || 5);
const warmupSec = Number(__ENV.WARMUP_SEC || 45);
const maxSec = Number(__ENV.MAX_SEC || 600);
const playerFile = __ENV.PLAYERS_FILE || "scripts/load/live.players.json";
if (!base || !code || !hostToken || !Number.isInteger(playerCount) || playerCount < 1 || !Number.isInteger(rounds) || rounds < 5) {
  throw new Error("Set BASE_URL, ROOM_CODE, HOST_TOKEN, STAGE_PLAYERS, and ROUNDS >= 5");
}

const fixture = JSON.parse(open(playerFile));
if (fixture.base !== base || fixture.code !== code) {
  throw new Error("PLAYERS_FILE belongs to a different room or URL");
}
const players = new SharedArray("prepared players", () => fixture.players);
if (players.length < playerCount + 2) {
  throw new Error(`Prepare at least ${playerCount + 2} tokens; found ${players.length}`);
}

const answerLatency = new Trend("answer_api_ms", true);
const answerFailure = new Rate("answer_api_failure");
const phaseLatency = new Trend("question_event_ms", true);
const revealSkew = new Trend("reveal_skew_ms", true);
const recovery = new Trend("reconnect_recovery_ms", true);
const streamErrors = new Counter("stream_errors");
const missedRounds = new Rate("missed_rounds");
const completedPlayers = new Counter("completed_players");
const completedHosts = new Counter("completed_hosts");

export const options = {
  scenarios: {
    players: {
      executor: "constant-vus", vus: playerCount, duration: `${maxSec}s`,
      exec: "playerStream", gracefulStop: "5s",
    },
    host: {
      executor: "constant-vus", vus: 1, duration: `${maxSec}s`,
      exec: "hostStream", gracefulStop: "5s",
    },
    controller: {
      executor: "shared-iterations", vus: 1, iterations: 1,
      startTime: `${warmupSec}s`, maxDuration: `${maxSec - warmupSec}s`,
      exec: "controlRoom",
    },
  },
  thresholds: {
    answer_api_failure: ["rate<0.01"],
    answer_api_ms: ["p(95)<500", "p(99)<1000"],
    question_event_ms: ["p(95)<1000"],
    reveal_skew_ms: ["p(99)<2000"],
    reconnect_recovery_ms: ["max<5000"],
    missed_rounds: ["rate<0.01"],
    completed_players: [`count>=${playerCount}`],
    completed_hosts: ["count>=1"],
  },
};

const room = `${base}/api/v1/sessions/${encodeURIComponent(code)}`;
const jsonHeaders = { "content-type": "application/json" };

export function setup() {
  const response = http.get(room);
  if (response.status !== 200) fail(`Room lookup failed (${response.status})`);
  const info = response.json();
  if (info.mode !== "live" || info.status !== "lobby") fail("Use a fresh live room in its lobby");
  if (info.participantCount < playerCount) fail("Prepare the players before starting k6");
}

function stream(url, onSnapshot) {
  const result = sse.open(url, { method: "GET", timeout: "290s" }, (client) => {
    client.on("event", (event) => {
      try {
        const snapshot = JSON.parse(event.data);
        if (snapshot && typeof snapshot.phase === "string") onSnapshot(snapshot, client);
      } catch {
        streamErrors.add(1);
      }
    });
    client.on("error", () => streamErrors.add(1));
  });
  if (!result || result.status !== 200) streamErrors.add(1);
}

export function playerStream() {
  // k6 assigns a unique __VU across all three scenarios. Two spare tokens
  // cover the host and controller without ever sharing a player identity.
  const player = players[__VU - 1];
  if (!player?.clientToken) fail(`No prepared token for VU ${__VU}`);
  const seen = {};
  let reconnectAt = 0;
  let finished = false;
  const shouldReconnect = __VU % 10 === 0;
  while (!finished) {
    stream(`${room}/stream?player=${encodeURIComponent(player.clientToken)}`, (state, client) => {
      if (reconnectAt) {
        recovery.add(Date.now() - reconnectAt);
        reconnectAt = 0;
      }
      if (state.phase === "ended") {
        for (let i = 0; i < rounds; i++) missedRounds.add(seen[i] !== "reveal");
        completedPlayers.add(1);
        finished = true;
        client.close();
        return;
      }
      const q = state.question;
      if (!q || q.index >= rounds) return;
      if (state.phase === "question" && !seen[q.index]) {
        seen[q.index] = "question";
        if (q.startedAt) phaseLatency.add(Math.max(0, Date.now() - Date.parse(q.startedAt)));
        // Spread one answer per player over a five-second burst.
        sleep((__VU % 50) / 10);
        const answer = { questionId: q.id, clientToken: player.clientToken };
        if (q.options?.length) answer.optionId = q.options[0].id;
        else if (q.type === "scale") answer.numberValue = 3;
        else answer.textValue = "load test";
        const start = Date.now();
        const response = http.post(`${room}/answers`, JSON.stringify(answer), { headers: jsonHeaders });
        answerLatency.add(Date.now() - start);
        answerFailure.add(response.status !== 200);
        if (shouldReconnect && !reconnectAt) {
          reconnectAt = Date.now();
          client.close();
        }
      } else if (state.phase === "reveal" && seen[q.index] !== "reveal") {
        seen[q.index] = "reveal";
        if (q.startedAt) revealSkew.add(Math.max(0, Date.now() - Date.parse(q.startedAt) - q.timeLimitSec * 1000));
      }
    });
    if (!finished) sleep(0.2);
  }
}

export function hostStream() {
  let ended = false;
  while (!ended) {
    stream(`${room}/stream?host=${encodeURIComponent(hostToken)}`, (state, client) => {
      if (state.phase === "ended") {
        completedHosts.add(1);
        ended = true;
        client.close();
      }
    });
    if (!ended) sleep(0.2);
  }
}

function action(name) {
  return http.post(`${room}/control`, JSON.stringify({ action: name }), {
    headers: { ...jsonHeaders, authorization: `Bearer ${hostToken}` },
  });
}

export function controlRoom() {
  const first = action("start");
  if (first.status !== 200) fail(`Start failed (${first.status}): ${first.body}`);
  for (let i = 1; i < rounds; i++) {
    const deadline = Date.now() + 120_000;
    for (;;) {
      const response = action("next");
      if (response.status === 200) break;
      if (response.status !== 409 || Date.now() > deadline) fail(`Next ${i} failed (${response.status}): ${response.body}`);
      sleep(0.5);
    }
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = action("next");
    if (response.status === 200) return;
    if (response.status !== 409) fail(`End failed (${response.status}): ${response.body}`);
    sleep(0.5);
  }
  fail("Final round did not reveal within 120 seconds");
}
