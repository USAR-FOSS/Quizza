"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Play, Eye, SkipForward, Square, Loader2, Users, Check } from "lucide-react";
import { api } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import type { HostSnapshot } from "@/lib/realtime/events";
import { COLOR_BG, type OptionColor } from "@/lib/quiz-constants";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/site/logo";
import { formatJoinCode } from "@/lib/codes";
import { cn } from "@/lib/utils";

const storeKey = (code: string) => `quizza:host:${code}`;

export function Host({ code }: { code: string }) {
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHostToken(localStorage.getItem(storeKey(code)));
    setReady(true);
  }, [code]);

  const url = hostToken ? api.streamUrl(code, { host: hostToken }) : null;
  const snap = useEventStream<HostSnapshot>(url);

  async function control(action: "start" | "reveal" | "next" | "end") {
    if (!hostToken) return;
    try {
      await api.control(code, hostToken, action);
    } catch {
      // ignored; next snapshot reflects truth
    }
  }

  if (ready && !hostToken) {
    return (
      <Shell>
        <Card>
          <h1 className="font-display text-2xl font-extrabold text-ink">Not the host</h1>
          <p className="mt-2 text-ink-soft">
            This browser does not hold the host key for room {formatJoinCode(code)}. Launch the
            session from the quiz editor to control it.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!snap) {
    return (
      <Shell>
        <Loader2 className="size-8 animate-spin text-grape" />
      </Shell>
    );
  }

  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/play/${code}` : "";
  const q = snap.question;
  const isLast = q ? q.index + 1 >= q.total : false;

  return (
    <div className="flex min-h-screen flex-col bg-paper-2">
      <header className="flex h-16 items-center justify-between border-b-2 border-ink/10 bg-paper px-5">
        <Logo className="h-7" />
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-display text-sm font-bold text-ink-soft">
            <Users className="size-4" />
            {snap.participantCount}
          </span>
          {snap.phase !== "ended" && snap.phase !== "lobby" && (
            <button
              onClick={() => control("end")}
              className="flex items-center gap-1.5 rounded-xl border-2 border-ink bg-paper px-3 py-1.5 font-display text-sm font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
            >
              <Square className="size-4" />
              End
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-8">
        <AnimatePresence mode="wait">
          {snap.phase === "lobby" && (
            <Lobby key="lobby" code={code} joinUrl={joinUrl} snap={snap} onStart={() => control("start")} />
          )}

          {snap.phase === "question" && q && (
            <motion.div key={`q-${q.id}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between font-display text-sm font-bold text-ink-soft">
                <span>Question {q.index + 1} of {q.total}</span>
                <span>{snap.answeredCount} / {snap.participantCount} answered</span>
              </div>
              <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
                {q.prompt}
              </h1>
              {q.options.length > 0 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {q.options.map((o) => (
                    <div
                      key={o.id}
                      className={cn(
                        "flex min-h-16 items-center rounded-2xl border-2 border-ink px-4 py-3 font-display text-lg font-bold text-white shadow-pop",
                        COLOR_BG[(o.color as OptionColor) ?? "grape"] ?? "bg-grape",
                        o.id === snap.correctOptionId && "ring-4 ring-ink ring-offset-2 ring-offset-paper-2",
                      )}
                    >
                      {o.label}
                      {o.id === snap.correctOptionId && <Check className="ml-auto size-5" strokeWidth={3} />}
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => control("reveal")}
                className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              >
                <Eye className="size-5" />
                Reveal answers
              </button>
            </motion.div>
          )}

          {snap.phase === "reveal" && q && (
            <motion.div key={`r-${q.id}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{q.prompt}</h1>
              {q.options.length > 0 && (
                <div className="mt-4 space-y-2">
                  {q.options.map((o) => {
                    const tally = snap.reveal?.tallies.find((t) => t.optionId === o.id);
                    const total = snap.reveal?.totalAnswers ?? 0;
                    const pct = total > 0 ? Math.round(((tally?.count ?? 0) / total) * 100) : 0;
                    const correct = o.id === snap.correctOptionId;
                    return (
                      <div key={o.id}>
                        <div className="flex items-center justify-between text-sm font-semibold text-ink">
                          <span className="flex items-center gap-1.5">
                            {correct && <Check className="size-4 text-mint" strokeWidth={3} />}
                            {o.label}
                          </span>
                          <span className="text-ink-soft">{tally?.count ?? 0} ({pct}%)</span>
                        </div>
                        <div className="mt-1 h-3 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2">
                          <div className={cn("h-full", correct ? "bg-mint" : "bg-grape")} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <MiniBoard snap={snap} />

              <button
                onClick={() => control("next")}
                className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              >
                <SkipForward className="size-5" />
                {isLast ? "Finish" : "Next question"}
              </button>
            </motion.div>
          )}

          {snap.phase === "ended" && (
            <motion.div key="end" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Session ended</h1>
              <MiniBoard snap={snap} full />
              <Link
                href="/"
                className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl border-2 border-ink bg-paper px-6 font-display font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
              >
                Done
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Lobby({
  code,
  joinUrl,
  snap,
  onStart,
}: {
  code: string;
  joinUrl: string;
  snap: HostSnapshot;
  onStart: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
      <p className="font-display text-sm font-bold uppercase tracking-widest text-grape">Join at</p>
      <p className="mt-1 break-all font-display text-lg font-bold text-ink">{joinUrl}</p>
      <p className="mt-4 font-mono text-7xl font-extrabold tracking-wider text-ink">{formatJoinCode(code)}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {snap.leaderboard.map((p) => (
          <span key={p.participantId} className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-2.5 py-1 shadow-pop">
            <Avatar name={p.nickname} color={p.avatarColor} size="sm" />
            <span className="font-display text-sm font-bold text-ink">{p.nickname}</span>
          </span>
        ))}
        {snap.participantCount === 0 && <p className="text-ink-soft">Waiting for players to join.</p>}
      </div>

      <button
        onClick={onStart}
        disabled={snap.participantCount === 0}
        className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape px-8 font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
      >
        <Play className="size-5 fill-current" />
        Start
      </button>
    </motion.div>
  );
}

function MiniBoard({ snap, full }: { snap: HostSnapshot; full?: boolean }) {
  const list = full ? snap.leaderboard.slice(0, 10) : snap.leaderboard.slice(0, 5);
  if (list.length === 0) return null;
  return (
    <div className="mx-auto mt-6 max-w-md space-y-2 text-left">
      {list.map((e) => (
        <div key={e.participantId} className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-paper p-2.5 shadow-pop">
          <span className="w-6 text-center font-display font-extrabold text-ink-soft">{e.rank}</span>
          <Avatar name={e.nickname} color={e.avatarColor} size="sm" />
          <span className="min-w-0 flex-1 truncate font-display font-bold text-ink">{e.nickname}</span>
          <span className="font-display font-extrabold text-ink">{e.score}</span>
        </div>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-paper-2 px-5">{children}</div>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg">
      {children}
    </div>
  );
}
