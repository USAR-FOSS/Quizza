"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Play, SkipForward, Square, Loader2, Users, Check, QrCode, Copy, Maximize2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import type { HostSnapshot } from "@/lib/realtime/events";
import { COLOR_BG, COLOR_TEXT, type OptionColor } from "@/lib/quiz-constants";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/site/logo";
import { formatJoinCode } from "@/lib/codes";
import { cn } from "@/lib/utils";
import { QuestionMedia } from "@/components/ui/question-media";
import { recoverHostToken } from "@/lib/actions/host";
import { LobbyCrowd } from "./lobby-crowd";
import { QuizCover, RoomTheme } from "./room-theme";
import { RoundClock } from "./round-clock";
import { WordCloud } from "@/components/ui/word-cloud";
import { QRCode } from "@/components/ui/qr-code";
import { Dialog } from "@/components/ui/dialog";

const storeKey = (code: string) => `quizza:host:${code}`;

export function Host({ code }: { code: string }) {
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyJoinUrl() {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = localStorage.getItem(storeKey(code));
      const token = stored ?? (await recoverHostToken(code));
      if (!alive) return;
      if (token) localStorage.setItem(storeKey(code), token);
      setHostToken(token);
      setReady(true);
    })().catch(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  const url = hostToken ? api.streamUrl(code, { host: hostToken }) : null;
  const { data: snap, connection } = useEventStream<HostSnapshot>(url);

  async function control(action: "start" | "reveal" | "next" | "end") {
    if (!hostToken || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.control(code, hostToken, action);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn’t control the session. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (ready && !hostToken) {
    return (
      <Shell>
        <Card>
          <h1 className="font-display text-2xl font-extrabold text-ink">
            Not the host
          </h1>
          <p className="mt-2 text-ink-soft">
            This browser does not hold the host key for room{" "}
            {formatJoinCode(code)}. Launch the session from the quiz editor to
            control it.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!snap) {
    return (
      <Shell>
        <div className="text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-grape" />
          <p role="status" className="mt-4 text-sm text-ink-soft">
            {connection === "reconnecting"
              ? "Reconnecting to your room… Check your connection."
              : "Getting your room ready…"}
          </p>
        </div>
      </Shell>
    );
  }

  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/play/${code}`
      : "";
  const q = snap.question;
  const isLast = q ? q.index + 1 >= q.total : false;

  return (
    <RoomTheme
      theme={snap.quiz.theme}
      className="flex min-h-screen flex-col bg-paper-2"
    >
      {connection === "reconnecting" && (
        <p
          role="status"
          className="bg-sun/20 p-3 text-center text-sm font-semibold"
        >
          Connection interrupted. Reconnecting to your room…
        </p>
      )}
      <header className="flex h-16 items-center justify-between border-b-2 border-ink/10 bg-paper px-5">
        <Logo className="h-7" />
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setShowQR(true)}
            title="Display QR code"
            className="flex items-center gap-1.5 rounded-xl border-2 border-ink bg-paper px-3 py-1.5 font-display text-sm font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <QrCode className="size-4 text-grape" />
            <span className="hidden sm:inline">QR Code</span>
          </button>
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

      {showQR && (
        <Dialog title="Scan to join" onClose={() => setShowQR(false)}>
          <div className="flex flex-col items-center text-center">
            <QRCode value={joinUrl} size={260} className="mx-auto" />
            <p className="mt-4 font-display text-xs font-bold uppercase tracking-widest text-grape">
              Room code
            </p>
            <p className="font-mono text-4xl font-extrabold tracking-wider text-ink sm:text-5xl">
              {formatJoinCode(code)}
            </p>
            <p className="mt-2 text-sm text-ink-soft">
              Scan with your phone camera or visit{" "}
              <span className="font-mono font-bold text-ink">{joinUrl}</span>
            </p>
            <button
              type="button"
              onClick={copyJoinUrl}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border-2 border-ink bg-grape px-5 py-2.5 font-display text-sm font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {copied ? (
                <>
                  <Check className="size-4 text-mint" strokeWidth={3} />
                  Link copied!
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy room link
                </>
              )}
            </button>
          </div>
        </Dialog>
      )}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-8">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-coral/10 p-3 text-sm font-semibold"
          >
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="mb-3 text-center text-sm text-ink-soft">
            Updating the room…
          </p>
        )}
        <AnimatePresence mode="wait">
          {snap.phase === "lobby" && (
            <Lobby
              key="lobby"
              code={code}
              joinUrl={joinUrl}
              snap={snap}
              onStart={() => control("start")}
              onOpenQR={() => setShowQR(true)}
              copied={copied}
              onCopy={copyJoinUrl}
            />
          )}

          {snap.phase === "question" && q && (
            <motion.div
              key={`q-${q.id}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center justify-between font-display text-sm font-bold text-ink-soft">
                <span>
                  Round {q.index + 1} / {q.total}
                </span>
                <span>
                  {snap.answeredCount} / {snap.participantCount} answered
                </span>
              </div>
              <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
                {q.prompt}
              </h1>
              <QuestionMedia url={q.mediaUrl} />
              {q.options.length > 0 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {q.options.map((o) => (
                    <div
                      key={o.id}
                      className={cn(
                        "flex min-h-16 items-center rounded-2xl border-2 border-ink px-4 py-3 font-display text-lg font-bold text-white shadow-pop",
                        COLOR_BG[(o.color as OptionColor) ?? "grape"] ??
                          "bg-grape",
                        COLOR_TEXT[(o.color as OptionColor) ?? "grape"] ??
                          "text-white",
                      )}
                    >
                      {o.label}
                    </div>
                  ))}
                </div>
              )}
              <RoundClock
                key={q.id}
                startedAt={q.startedAt}
                seconds={q.timeLimitSec}
                clockOffsetMs={snap.clockOffsetMs}
              />
            </motion.div>
          )}

          {snap.phase === "reveal" && q && (
            <motion.div
              key={`r-${q.id}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
                {q.prompt}
              </h1>
              <QuestionMedia url={q.mediaUrl} />
              {q.options.length > 0 && (
                <div className="mt-4 space-y-2">
                  {q.options.map((o) => {
                    const tally = snap.reveal?.tallies.find(
                      (t) => t.optionId === o.id,
                    );
                    const total = snap.reveal?.totalAnswers ?? 0;
                    const pct =
                      total > 0
                        ? Math.round(((tally?.count ?? 0) / total) * 100)
                        : 0;
                    const correct = o.id === snap.correctOptionId;
                    return (
                      <div key={o.id}>
                        <div className="flex items-center justify-between text-sm font-semibold text-ink">
                          <span className="flex items-center gap-1.5">
                            {correct && (
                              <Check
                                className="size-4 text-mint"
                                strokeWidth={3}
                              />
                            )}
                            {o.label}
                          </span>
                          <span className="text-ink-soft">
                            {tally?.count ?? 0} ({pct}%)
                          </span>
                        </div>
                        <div className="mt-1 h-3 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2">
                          <div
                            className={cn(
                              "h-full",
                              correct ? "bg-mint" : "bg-grape",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <MiniBoard snap={snap} />
              {q.type === "word_cloud" && (
                <WordCloud values={snap.reveal?.textValues ?? []} />
              )}
              {q.type === "open_text" && (
                <div className="mt-4 space-y-2">
                  {snap.reveal?.textValues.map((text, i) => (
                    <p
                      key={i}
                      className="rounded-xl border border-ink/15 bg-paper p-3 text-sm"
                    >
                      {text}
                    </p>
                  ))}
                </div>
              )}
              {q.type === "scale" && (
                <p className="mt-6 text-center font-display text-xl">
                  Room average:{" "}
                  <strong>
                    {snap.reveal?.numberAverage?.toFixed(1) ??
                      "No responses yet"}
                  </strong>
                </p>
              )}

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
            <motion.div
              key="end"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
                Session ended
              </h1>
              <MiniBoard snap={snap} full />
              <Link
                href={`/results/${code}`}
                className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl border-2 border-ink bg-paper px-6 font-display font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
              >
                View full results & export
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </RoomTheme>
  );
}

function Lobby({
  code,
  joinUrl,
  snap,
  onStart,
  onOpenQR,
  copied,
  onCopy,
}: {
  code: string;
  joinUrl: string;
  snap: HostSnapshot;
  onStart: () => void;
  onOpenQR: () => void;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="text-center"
    >
      <QuizCover quiz={snap.quiz} />
      <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        {snap.quiz.title}
      </h1>

      <div className="mx-auto my-6 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
        <button
          type="button"
          onClick={onOpenQR}
          title="Click to expand QR code"
          className="group relative cursor-pointer transition-transform hover:scale-105 active:scale-100"
        >
          <QRCode value={joinUrl} size={170} />
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg border border-ink bg-paper px-2 py-0.5 text-xs font-bold text-ink opacity-90 shadow-sm transition-opacity group-hover:opacity-100">
            <Maximize2 className="size-3 text-grape" />
            Expand
          </span>
        </button>

        <div className="text-center sm:text-left">
          <p className="font-display text-xs font-bold uppercase tracking-widest text-grape">
            Join at
          </p>
          <p className="mt-0.5 break-all font-display text-base font-bold text-ink">
            {joinUrl}
          </p>
          <p className="mt-2 font-mono text-[clamp(2.5rem,7vw,4rem)] font-extrabold tracking-wider text-ink">
            {formatJoinCode(code)}
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border-2 border-ink bg-paper px-3 py-1 font-display text-xs font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-mint" strokeWidth={3} />
                Link copied!
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copy room link
              </>
            )}
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm font-semibold text-ink-soft">
        {snap.participantCount}{" "}
        {snap.participantCount === 1 ? "player" : "players"} joined
      </p>
      <LobbyCrowd players={snap.onlineParticipants} />

      <button
        onClick={onStart}
        disabled={snap.participantCount === 0}
        className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape px-8 font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
      >
        <Play className="size-5 fill-current" />
        Start quiz
      </button>
    </motion.div>
  );
}

function MiniBoard({ snap, full }: { snap: HostSnapshot; full?: boolean }) {
  const list = full
    ? snap.leaderboard.slice(0, 10)
    : snap.leaderboard.slice(0, 5);
  if (list.length === 0) return null;
  return (
    <div className="mx-auto mt-6 max-w-md space-y-2 text-left">
      {list.map((e) => (
        <div
          key={e.participantId}
          className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-paper p-2.5 shadow-pop"
        >
          <span className="w-6 text-center font-display font-extrabold text-ink-soft">
            {e.rank}
          </span>
          <Avatar
            name={e.nickname}
            color={e.avatarColor}
            src={e.avatarUrl}
            size="sm"
          />
          <span className="min-w-0 flex-1 truncate font-display font-bold text-ink">
            {e.nickname}{e.teamName && <span className="ml-2 font-sans text-xs font-medium text-ink-soft">{e.teamName}</span>}
          </span>
          <span className="font-display font-extrabold text-ink">
            {e.score}
          </span>
        </div>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-2 px-5">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg">
      {children}
    </div>
  );
}
