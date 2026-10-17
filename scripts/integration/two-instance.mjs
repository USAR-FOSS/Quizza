// Opt-in smoke test for two production Next processes sharing Postgres + Redis.
// Requires a fresh live lobby with >= 2 short questions and its host token.
import { spawn } from "node:child_process";

const code = process.env.ROOM_CODE;
const hostToken = process.env.HOST_TOKEN;
const redisUrl = process.env.REDIS_URL;
const databaseUrl = process.env.DATABASE_URL;
const firstPort = Number(process.env.FIRST_PORT ?? 3101);
if (!code || !hostToken || !redisUrl || !databaseUrl || !Number.isInteger(firstPort)) {
  throw new Error("Set ROOM_CODE, HOST_TOKEN, REDIS_URL, and DATABASE_URL");
}
const bases = [`http://localhost:${firstPort}`, `http://localhost:${firstPort + 1}`];
const children = [];
const streams = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function launch(base, port) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      REALTIME_DRIVER: "redis",
      APP_URL: base,
      // A localhost callback cannot be reached by QStash; use the explicit
      // local timer fallback while exercising real cross-process Redis fan-out.
      QSTASH_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const pipe of [child.stdout, child.stderr]) {
    pipe.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-4000);
    });
  }
  children.push(child);
  return () => output;
}

async function request(base, path, init) {
  const response = await fetch(`${base}/api/v1/sessions/${encodeURIComponent(code)}${path}`, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path || "room"} at ${base}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function waitReady(base, logs) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      return await request(base, "");
    } catch {
      await pause(300);
    }
  }
  throw new Error(`App did not start at ${base}\n${logs()}`);
}

async function openStream(base, role, token) {
  const abort = new AbortController();
  const response = await fetch(
    `${base}/api/v1/sessions/${encodeURIComponent(code)}/stream?${role}=${encodeURIComponent(token)}`,
    { signal: abort.signal },
  );
  if (!response.ok || !response.body) throw new Error(`SSE ${role} at ${base}: ${response.status}`);
  const events = [];
  const waiters = new Set();
  let closed = false;
  const stream = {
    close() { closed = true; abort.abort(); },
    waitFor(predicate, timeoutMs = 30_000) {
      const previous = events.find(predicate);
      if (previous) return Promise.resolve(previous);
      return new Promise((resolve, reject) => {
        const waiter = (event) => {
          if (!predicate(event)) return;
          clearTimeout(timer);
          waiters.delete(waiter);
          resolve(event);
        };
        const timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`Timed out waiting for ${role} event at ${base}`));
        }, timeoutMs);
        waiters.add(waiter);
      });
    },
  };
  streams.push(stream);
  void (async () => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!closed) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n");
        if (!data) continue;
        let event;
        try { event = JSON.parse(data); } catch { continue; }
        events.push(event);
        if (events.length > 100) events.shift();
        for (const waiter of waiters) waiter(event);
      }
    }
  })().catch((error) => {
    if (!closed) console.error(`SSE reader at ${base} failed:`, error);
  });
  return stream;
}

const json = (value) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});
const control = (base, action) => request(base, "/control", {
  ...json({ action }),
  headers: { "content-type": "application/json", authorization: `Bearer ${hostToken}` },
});

try {
  const firstLogs = launch(bases[0], firstPort);
  const secondLogs = launch(bases[1], firstPort + 1);
  const [first, second] = await Promise.all([
    waitReady(bases[0], firstLogs),
    waitReady(bases[1], secondLogs),
  ]);
  if (first.mode !== "live" || first.status !== "lobby" || second.status !== "lobby") {
    throw new Error("Use a fresh live lobby shared by both app processes");
  }

  const host = await openStream(bases[0], "host", hostToken);
  await host.waitFor((event) => event.phase === "lobby");
  const playerA = await request(bases[0], "/participants", json({ nickname: `Smoke A ${Date.now()}` }));
  const playerB = await request(bases[1], "/participants", json({ nickname: `Smoke B ${Date.now()}` }));
  await host.waitFor((event) => event.participantChanged?.participantId === playerB.id);
  const player = await openStream(bases[1], "player", playerA.clientToken);
  await player.waitFor((event) => event.phase === "lobby");

  await control(bases[0], "start");
  const firstQuestion = await player.waitFor((event) => event.phase === "question" && event.question?.id);
  const answer = { questionId: firstQuestion.question.id, clientToken: playerA.clientToken };
  if (firstQuestion.question.options.length) answer.optionId = firstQuestion.question.options[0].id;
  else if (firstQuestion.question.type === "scale") answer.numberValue = 3;
  else answer.textValue = "smoke test";
  await request(bases[1], "/answers", json(answer));
  await host.waitFor((event) => event.tick >= 1);
  await player.waitFor((event) => event.phase === "reveal" && event.question?.id === firstQuestion.question.id, 120_000);

  player.close();
  const recovered = await openStream(bases[1], "player", playerA.clientToken);
  await recovered.waitFor((event) => event.phase === "reveal" && event.question?.id === firstQuestion.question.id);
  await control(bases[1], "next");
  await recovered.waitFor((event) => event.phase === "question" && event.question?.id !== firstQuestion.question.id);
  await control(bases[0], "end");
  await recovered.waitFor((event) => event.phase === "ended");
  console.log("PASS: two processes, cross-instance join/start/answer tick/reveal/next/end, and SSE recovery");
} finally {
  for (const stream of streams) stream.close();
  for (const child of children) child.kill("SIGTERM");
  await pause(300);
}
