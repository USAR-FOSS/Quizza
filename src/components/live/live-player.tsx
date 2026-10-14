"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, Clock, Loader2, Trophy } from "lucide-react";
import { api, type AnswerResult, type SessionPublic } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import type { PlayerSnapshot } from "@/lib/realtime/events";
import { OPTION_COLORS, COLOR_BG, type OptionColor } from "@/lib/quiz-constants";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Identity = {
  clientToken: string;
  participantId: string;
  nickname: string;
  avatarColor: string;
};

const storeKey = (code: string) => `quizza:player:${code}`;

export function LivePlayer({ code }: { code: string }) {
  const [session, setSession] = useState<SessionPublic | null>(null);
  const [me, setMe] = useState<Identity | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.getSession(code);
        if (!alive) return;
        setSession(s);
        const stored = localStorage.getItem(storeKey(code));
        if (stored) setMe(JSON.parse(stored));
      } catch {
        if (alive) setNotFound(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  async function join(nickname: string, avatarColor: string) {
    const p = await api.join(code, { nickname, avatarColor });
    const identity: Identity = {
      clientToken: p.clientToken,
      participantId: p.id,
      nickname: p.nickname,
      avatarColor: p.avatarColor,
    };
    localStorage.setItem(storeKey(code), JSON.stringify(identity));
    setMe(identity);
  }

  if (notFound) {
    return <Screen><Panel title="Room not found" body={`No room for code ${code}.`} /></Screen>;
  }
  if (!session) {
    return <Screen><Loader2 className="size-8 animate-spin text-grape" /></Screen>;
  }
  if (!me) {
    return <Screen><JoinForm onJoin={join} /></Screen>;
  }
  return <Connected code={code} me={me} />;
}

function Connected({ code, me }: { code: string; me: Identity }) {
  const url = api.streamUrl(code, { player: me.clientToken });
  const snap = useEventStream<PlayerSnapshot>(url);
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AnswerResult>>({});
  const startRef = useRef<number>(Date.now());

  const q = snap?.question ?? null;

  // reset per-question state when the question changes
  useEffect(() => {
    if (q?.startedAt) startRef.current = new Date(q.startedAt).getTime();
  }, [q?.id, q?.startedAt]);

  async function answer(payload: { optionId?: string; textValue?: string; numberValue?: number }) {
    if (!q || answeredFor === q.id) return;
    setAnsweredFor(q.id);
    try {
      const res = await api.submitAnswer(code, {
        questionId: q.id,
        clientToken: me.clientToken,
        elapsedMs: Date.now() - startRef.current,
        ...payload,
      });
      setResults((r) => ({ ...r, [q.id]: res }));
    } catch {
      // already answered or closed; keep locked
    }
  }

  if (!snap) {
    return <Screen><Loader2 className="size-8 animate-spin text-grape" /></Screen>;
  }

  const mine = snap.leaderboard.find((e) => e.participantId === me.participantId);

  return (
    <div className="flex min-h-screen flex-col bg-paper bg-dots">
      <header className="flex h-14 items-center justify-between border-b-2 border-ink/10 px-5">
        <span className="font-display text-sm font-bold text-ink-soft">{snap.quiz.title}</span>
        <span className="flex items-center gap-2">
          <Avatar name={me.nickname} color={me.avatarColor} size="sm" />
          <span className="font-display text-sm font-bold text-ink">{me.nickname}</span>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-8">
        <AnimatePresence mode="wait">
          {snap.phase === "lobby" && (
            <Panel
              key="lobby"
              title="You're in"
              body={`Waiting for the host to start. ${snap.participantCount} here.`}
            >
              <div className="mt-4 flex justify-center">
                <Avatar name={me.nickname} color={me.avatarColor} size="lg" />
              </div>
            </Panel>
          )}

          {snap.phase === "question" && q && (
            <QuestionLive
              key={`q-${q.id}`}
              snap={snap}
              answered={answeredFor === q.id}
              onAnswer={answer}
            />
          )}

          {snap.phase === "reveal" && q && (
            <RevealLive
              key={`r-${q.id}`}
              snap={snap}
              result={results[q.id] ?? null}
              meId={me.participantId}
            />
          )}

          {snap.phase === "ended" && (
            <FinalBoard key="end" snap={snap} meId={me.participantId} mine={mine} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ------------------------------ pieces ------------------------------ */

function QuestionLive({
  snap,
  answered,
  onAnswer,
}: {
  snap: PlayerSnapshot;
  answered: boolean;
  onAnswer: (p: { optionId?: string; textValue?: string; numberValue?: number }) => void;
}) {
  const q = snap.question!;
  const [remaining, setRemaining] = useState(q.timeLimitSec);
  const [text, setText] = useState("");

  useEffect(() => {
    const started = q.startedAt ? new Date(q.startedAt).getTime() : Date.now();
    const id = setInterval(() => {
      setRemaining(Math.max(0, q.timeLimitSec - (Date.now() - started) / 1000));
    }, 200);
    return () => clearInterval(id);
  }, [q.id, q.startedAt, q.timeLimitSec]);

  const pct = (remaining / q.timeLimitSec) * 100;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <div className="flex items-center justify-between text-sm font-bold text-ink-soft">
        <span>Question {q.index + 1} of {q.total}</span>
        <span className="flex items-center gap-1">
          <Clock className="size-4" />
          {Math.ceil(remaining)}s
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2">
        <div className="h-full bg-grape transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <h1 className="mt-6 font-display text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
        {q.prompt}
      </h1>

      {answered ? (
        <div className="mt-8 rounded-2xl border-2 border-ink bg-paper-2 p-6 text-center font-display text-lg font-bold text-ink">
          Locked in. Waiting for others.
        </div>
      ) : (
        <div className="mt-6">
          {q.options.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => onAnswer({ optionId: o.id })}
                  className={cn(
                    "flex min-h-16 items-center rounded-2xl border-2 border-ink px-4 py-3 text-left font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
                    COLOR_BG[(o.color as OptionColor) ?? "grape"] ?? "bg-grape",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : q.type === "scale" ? (
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => onAnswer({ numberValue: n })}
                  className="flex size-14 items-center justify-center rounded-2xl border-2 border-ink bg-paper-2 font-display text-xl font-extrabold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) onAnswer({ textValue: text.trim() });
              }}
            >
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your answer"
                maxLength={280}
                className="w-full rounded-2xl border-2 border-ink bg-paper-2 px-4 py-3 font-display text-lg font-bold text-ink placeholder:text-ink-soft/50 focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display font-bold text-white shadow-pop disabled:opacity-50"
              >
                Submit
              </button>
            </form>
          )}
        </div>
      )}
    </motion.div>
  );
}

function RevealLive({
  snap,
  result,
  meId,
}: {
  snap: PlayerSnapshot;
  result: AnswerResult | null;
  meId: string;
}) {
  const q = snap.question!;
  const correctId = snap.reveal?.correctOptionId ?? null;
  const scored = correctId !== null;
  const mine = snap.leaderboard.find((e) => e.participantId === meId);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
      {scored && result && (
        <div className="mb-5 text-center">
          <div
            className={cn(
              "mx-auto flex size-16 items-center justify-center rounded-2xl border-2 border-ink",
              result.isCorrect ? "bg-mint" : "bg-coral",
            )}
          >
            {result.isCorrect ? (
              <Check className="size-8 text-white" strokeWidth={3} />
            ) : (
              <X className="size-8 text-white" strokeWidth={3} />
            )}
          </div>
          <h2 className="mt-3 font-display text-2xl font-extrabold text-ink">
            {result.isCorrect ? `Correct, +${result.pointsAwarded}` : "Not quite"}
          </h2>
        </div>
      )}

      <h1 className="font-display text-xl font-bold text-ink">{q.prompt}</h1>
      {q.options.length > 0 && (
        <div className="mt-3 space-y-2">
          {q.options.map((o) => {
            const tally = snap.reveal?.tallies.find((t) => t.optionId === o.id);
            const total = snap.reveal?.totalAnswers ?? 0;
            const pct = total > 0 ? Math.round(((tally?.count ?? 0) / total) * 100) : 0;
            const isCorrect = o.id === correctId;
            return (
              <div key={o.id}>
                <div className="flex items-center justify-between text-sm font-semibold text-ink">
                  <span className="flex items-center gap-1.5">
                    {isCorrect && <Check className="size-4 text-mint" strokeWidth={3} />}
                    {o.label}
                  </span>
                  <span className="text-ink-soft">{pct}%</span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2">
                  <div className={cn("h-full", isCorrect ? "bg-mint" : "bg-grape")} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mine && (
        <p className="mt-5 text-center font-display text-ink-soft">
          You are <span className="font-extrabold text-ink">#{mine.rank}</span> with{" "}
          <span className="font-extrabold text-ink">{mine.score}</span>
        </p>
      )}
    </motion.div>
  );
}

function FinalBoard({
  snap,
  meId,
  mine,
}: {
  snap: PlayerSnapshot;
  meId: string;
  mine?: { rank: number; score: number };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg"
    >
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border-2 border-ink bg-sun">
        <Trophy className="size-8 text-ink" />
      </div>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-ink">Final results</h1>
      {mine && (
        <p className="mt-2 text-ink-soft">
          You placed <span className="font-bold text-ink">#{mine.rank}</span> with{" "}
          <span className="font-bold text-ink">{mine.score}</span>
        </p>
      )}
      <div className="mt-6 space-y-2 text-left">
        {snap.leaderboard.slice(0, 8).map((e) => (
          <div
            key={e.participantId}
            className={cn(
              "flex items-center gap-3 rounded-2xl border-2 border-ink p-2.5",
              e.participantId === meId ? "bg-grape/10" : "bg-paper-2",
            )}
          >
            <span className="w-6 text-center font-display font-extrabold text-ink-soft">{e.rank}</span>
            <Avatar name={e.nickname} color={e.avatarColor} size="sm" />
            <span className="min-w-0 flex-1 truncate font-display font-bold text-ink">{e.nickname}</span>
            <span className="font-display font-extrabold text-ink">{e.score}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function JoinForm({ onJoin }: { onJoin: (nickname: string, color: string) => Promise<void> }) {
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState<string>(OPTION_COLORS[0]);
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim() || busy) return;
    setBusy(true);
    try {
      await onJoin(nickname.trim(), color);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.form
      onSubmit={go}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-7 shadow-pop-lg"
    >
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Pick a name</h1>
      <div className="mt-4 flex items-center gap-3">
        <Avatar name={nickname || "?"} color={color} size="lg" />
        <input
          autoFocus
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Your nickname"
          maxLength={40}
          className="min-w-0 flex-1 rounded-2xl border-2 border-ink bg-paper-2 px-4 py-3 font-display text-lg font-bold text-ink placeholder:text-ink-soft/50 focus:bg-white focus:outline-none"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {OPTION_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={c}
            className={cn(
              "size-9 rounded-xl border-2 transition-transform hover:scale-110",
              COLOR_BG[c as OptionColor],
              color === c ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper" : "border-ink/30",
            )}
          />
        ))}
      </div>
      <button
        type="submit"
        disabled={!nickname.trim() || busy}
        className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop disabled:opacity-50"
      >
        {busy ? "Joining" : "Join"}
      </button>
    </motion.form>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper bg-dots px-5">
      {children}
    </div>
  );
}

function Panel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg"
    >
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-ink-soft">{body}</p>
      {children}
    </motion.div>
  );
}
