"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, Clock, Loader2, Trophy, LogIn } from "lucide-react";
import {
  api,
  ApiClientError,
  type AnswerResult,
  type Results,
  type SessionPublic,
} from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import type { PlayerSnapshot } from "@/lib/realtime/events";
import {
  OPTION_COLORS,
  COLOR_BG,
  COLOR_TEXT,
  type OptionColor,
} from "@/lib/quiz-constants";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { QuestionMedia } from "@/components/ui/question-media";
import { PowerupIntro, PowerupPicker } from "@/components/live/powerup-picker";
import { AnswerReview } from "@/components/live/answer-review";
import type { Powerup } from "@/lib/powerups";
import { LoadingState } from "@/components/ui/loading-state";
import { QuizBuddy } from "@/components/ui/quiz-buddy";
import { WordCloud } from "@/components/ui/word-cloud";
import { AvatarChoice } from "@/components/ui/avatar-choice";
import { uploadImage } from "@/lib/upload-client";
import { LobbyCrowd } from "./lobby-crowd";
import { QuizCover, RoomTheme } from "./room-theme";

type Identity = {
  clientToken: string;
  participantId: string;
  nickname: string;
  avatarColor: string;
  avatarUrl?: string | null;
  photoWarning?: string;
};

const storeKey = (code: string) => `quizza:player:${code}`;

export function LivePlayer({ code }: { code: string }) {
  const [session, setSession] = useState<SessionPublic | null>(null);
  const [me, setMe] = useState<Identity | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [signinRequired, setSigninRequired] = useState(false);

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

  async function join(
    nickname: string,
    avatarColor: string,
    photo: File | null,
  ) {
    try {
      const p = await api.join(code, { nickname, avatarColor });
      const identity: Identity = {
        clientToken: p.clientToken,
        participantId: p.id,
        nickname: p.nickname,
        avatarColor: p.avatarColor,
        avatarUrl: p.avatarUrl,
      };
      if (photo) {
        try {
          identity.avatarUrl = await uploadImage(photo, {
            code,
            clientToken: p.clientToken,
          });
        } catch (err) {
          identity.photoWarning = `You joined, but your photo wasn’t uploaded: ${err instanceof Error ? err.message : "Please try a smaller image next time."}`;
        }
      }
      localStorage.setItem(storeKey(code), JSON.stringify(identity));
      setMe(identity);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "signin_required") {
        setSigninRequired(true);
      } else {
        throw err;
      }
    }
  }

  if (notFound) {
    return (
      <Screen>
        <Panel title="Room not found" body={`No room for code ${code}.`} />
      </Screen>
    );
  }
  if (!session) {
    return (
      <Screen>
        <LoadingState label="Finding your people…" />
      </Screen>
    );
  }
  if (signinRequired) {
    return (
      <Screen>
        <div className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border-2 border-ink bg-paper-2">
            <LogIn className="size-8 text-ink" />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Sign in to play
          </h1>
          <p className="mt-2 text-ink-soft">
            This quiz allows one attempt per person, so it needs you signed in.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/play/${code}`)}`}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape px-6 font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5"
          >
            <LogIn className="size-5" />
            Sign in
          </Link>
        </div>
      </Screen>
    );
  }
  if (!me) {
    return (
      <Screen>
        <JoinForm onJoin={join} quiz={session.quiz} />
      </Screen>
    );
  }
  return <Connected code={code} me={me} />;
}

function Connected({ code, me }: { code: string; me: Identity }) {
  const url = api.streamUrl(code, { player: me.clientToken });
  const { data: snap, connection } = useEventStream<PlayerSnapshot>(url);
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AnswerResult>>({});
  const [finalResults, setFinalResults] = useState<Results | null>(null);
  const [answerError, setAnswerError] = useState("");
  const [usedPowerups, setUsedPowerups] = useState<Powerup[]>([]);
  const [previousAnswers, setPreviousAnswers] = useState<string[]>([]);
  const startRef = useRef<number>(0);

  const q = snap?.question ?? null;
  useEffect(() => {
    let alive = true;
    api
      .getProgress(code, me.clientToken)
      .then((progress) => {
        if (alive) {
          setUsedPowerups(progress.usedPowerups);
          setPreviousAnswers(progress.answered);
          setResults((current) => ({ ...current, ...progress.results }));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code, me.clientToken, snap?.phase, q?.id]);

  useEffect(() => {
    if (snap?.phase !== "ended") return;
    let alive = true;
    api.getResults(code).then((value) => {
      if (alive) setFinalResults(value);
    }).catch(() => {});
    return () => { alive = false; };
  }, [code, snap?.phase]);

  // reset per-question state when the question changes
  useEffect(() => {
    if (q?.startedAt) startRef.current = new Date(q.startedAt).getTime();
  }, [q?.id, q?.startedAt]);

  async function answer(payload: {
    optionId?: string;
    textValue?: string;
    numberValue?: number;
    powerup?: Powerup;
    powerupTargetId?: string;
  }) {
    if (!q || answeredFor === q.id) return;
    setAnsweredFor(q.id);
    setAnswerError("");
    try {
      const res = await api.submitAnswer(code, {
        questionId: q.id,
        clientToken: me.clientToken,
        elapsedMs: Date.now() - startRef.current,
        ...payload,
      });
      setResults((r) => ({ ...r, [q.id]: res }));
      setPreviousAnswers((ids) => [...ids, q.id]);
      if (payload.powerup)
        setUsedPowerups((used) => [...used, payload.powerup!]);
    } catch (err) {
      if (
        !(
          err instanceof ApiClientError &&
          [
            "already_answered",
            "question_expired",
            "not_current_question",
          ].includes(err.code)
        )
      ) {
        setAnsweredFor(null);
      }
      setAnswerError(
        err instanceof Error ? err.message : "Couldn’t submit. Try again.",
      );
      if (
        err instanceof ApiClientError &&
        err.code === "powerup_used" &&
        payload.powerup
      )
        void api.getProgress(code, me.clientToken).then((progress) =>
          setUsedPowerups(progress.usedPowerups),
        ).catch(() => {});
    }
  }

  if (!snap) {
    return (
      <Screen>
        <div className="text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-grape" />
          <p role="status" className="mt-4 text-sm text-ink-soft">
            {connection === "reconnecting"
              ? "Reconnecting… Check your connection or rejoin the room."
              : "Finding your people…"}
          </p>
        </div>
      </Screen>
    );
  }

  const mine = snap.leaderboard.find(
    (e) => e.participantId === me.participantId,
  );

  return (
    <RoomTheme
      theme={snap.quiz.theme}
      className="flex min-h-screen flex-col bg-paper bg-dots"
    >
      {me.photoWarning && (
        <p role="status" className="bg-sun/20 p-3 text-center text-sm">
          {me.photoWarning}
        </p>
      )}
      {connection === "reconnecting" && (
        <p
          role="status"
          className="bg-sun/20 p-3 text-center text-sm font-semibold"
        >
          Connection interrupted. Your answers are saved. Reconnecting…
        </p>
      )}
      <header className="flex h-14 items-center justify-between border-b-2 border-ink/10 px-5">
        <span className="min-w-0 truncate pr-3 font-display text-sm font-bold text-ink-soft">
          {snap.quiz.title}
        </span>
        <span className="flex items-center gap-2">
          <Avatar
            name={me.nickname}
            color={me.avatarColor}
            src={me.avatarUrl}
            size="sm"
          />
          <span className="max-w-28 truncate font-display text-sm font-bold text-ink">
            {me.nickname}
          </span>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-8">
        {answerError && snap.phase === "question" && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-coral/10 p-3 text-sm font-semibold"
          >
            {answerError}
          </p>
        )}
        <AnimatePresence mode="wait">
          {snap.phase === "lobby" && (
            <Panel
              key="lobby"
              title="You’ve found your people."
              body={`${snap.participantCount} in the room. The host will start your first round.`}
            >
              <QuizCover quiz={snap.quiz} />
              <PowerupIntro types={snap.quiz.powerupTypes ?? []} uses={snap.quiz.powerupUses ?? 1} />
              <LobbyCrowd players={snap.leaderboard} meId={me.participantId} />
              <p className="mt-4 text-xs text-ink-soft">
                Choose → lock in → reveal together. Keep this tab open.
              </p>
            </Panel>
          )}

          {snap.phase === "question" && q && (
            <QuestionLive
              key={`q-${q.id}`}
              snap={snap}
              answered={answeredFor === q.id || previousAnswers.includes(q.id)}
              onAnswer={answer}
              usedPowerups={usedPowerups}
              code={code}
              me={me}
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
            <FinalBoard
              key="end"
              snap={snap}
              meId={me.participantId}
              mine={mine}
              results={finalResults}
            />
          )}
        </AnimatePresence>
      </main>
    </RoomTheme>
  );
}

/* ------------------------------ pieces ------------------------------ */

function QuestionLive({
  snap,
  answered,
  onAnswer,
  usedPowerups,
  code,
  me,
}: {
  snap: PlayerSnapshot;
  answered: boolean;
  onAnswer: (p: {
    optionId?: string;
    textValue?: string;
    numberValue?: number;
    powerup?: Powerup;
    powerupTargetId?: string;
  }) => void;
  usedPowerups: Powerup[];
  code: string;
  me: Identity;
}) {
  const q = snap.question!;
  const [remaining, setRemaining] = useState(q.timeLimitSec);
  const [text, setText] = useState("");
  const [selection, setSelection] = useState<{
    optionId?: string;
    numberValue?: number;
  } | null>(null);
  const [powerup, setPowerup] = useState<Powerup>();
  const [targetId, setTargetId] = useState<string>();
  const [choiceError, setChoiceError] = useState("");
  const uses = snap.quiz.powerupUses ?? 1;
  const availablePowerup = powerup &&
    usedPowerups.filter((used) => used === powerup).length < uses ? powerup : undefined;
  const lock = (payload: {
    optionId?: string;
    textValue?: string;
    numberValue?: number;
  }) => {
    if (availablePowerup === "attack" && !targetId) {
      setChoiceError("Pick a player for your attack, or choose another powerup.");
      return;
    }
    setChoiceError("");
    onAnswer({ ...payload, powerup: availablePowerup,
      powerupTargetId: availablePowerup === "attack" ? targetId : undefined });
  };

  useEffect(() => {
    const started = q.startedAt ? new Date(q.startedAt).getTime() : Date.now();
    const id = setInterval(() => {
      setRemaining(
        Math.max(
          0,
          Math.min(
            q.timeLimitSec,
            q.timeLimitSec -
              (Date.now() + (snap.clockOffsetMs ?? 0) - started) / 1000,
          ),
        ),
      );
    }, 200);
    return () => clearInterval(id);
  }, [q.id, q.startedAt, q.timeLimitSec, snap.clockOffsetMs]);

  const pct = (remaining / q.timeLimitSec) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="flex items-center justify-between text-sm font-bold text-ink-soft">
        <span>
          Round {q.index + 1} / {q.total}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-4" />
          {Math.ceil(remaining)}s
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2">
        <div
          className={cn(
            "h-full transition-[width] duration-200",
            remaining <= 5 ? "bg-coral" : "bg-grape",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label="Quiz progress" aria-valuenow={q.index + 1} aria-valuemin={0} aria-valuemax={q.total}>
        <div className="h-full rounded-full bg-mint transition-[width]" style={{ width: `${((q.index + 1) / q.total) * 100}%` }} />
      </div>
      <h1 className="mt-6 font-display text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
        {q.prompt}
      </h1>
      <QuestionMedia url={q.mediaUrl} />
      {!answered &&
        snap.quiz.powerups &&
        ["multiple_choice", "true_false"].includes(q.type) && (
          <PowerupPicker
            selected={availablePowerup}
            used={usedPowerups}
            uses={uses}
            available={snap.quiz.powerupTypes ?? []}
            onChange={setPowerup}
            disabled={remaining <= 0}
            code={code}
            clientToken={me.clientToken}
            targetId={targetId}
            onTargetChange={setTargetId}
          />
        )}
      {choiceError && <p role="alert" className="mt-2 text-sm font-semibold text-coral">{choiceError}</p>}

      {answered ? (
        <div
          role="status"
          className="mt-6 rounded-3xl border-2 border-ink bg-sun/15 p-5 text-center text-ink"
        >
          <QuizBuddy className="mx-auto w-32" mood="locked" />
          <h2 className="font-display text-2xl font-extrabold">
            Your answer’s under wraps.
          </h2>
          {selection && (
            <p className="mt-2 font-semibold">
              {q.options.find((o) => o.id === selection.optionId)?.label ??
                selection.numberValue}
            </p>
          )}
          <p className="mt-2 text-sm text-ink-soft">
            {remaining > 0
              ? `Locked in. The whole room reveals in ${Math.ceil(remaining)}s.`
              : "Time’s up. Opening everyone’s answers…"}
          </p>
        </div>
      ) : (
        <fieldset
          disabled={remaining <= 0}
          className="mt-6 disabled:opacity-50"
        >
          {q.options.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelection({ optionId: o.id })}
                  aria-pressed={selection?.optionId === o.id}
                  className={cn(
                    "flex min-h-16 items-center rounded-2xl border-2 border-ink px-4 py-3 text-left font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
                    COLOR_BG[(o.color as OptionColor) ?? "grape"] ?? "bg-grape",
                    COLOR_TEXT[(o.color as OptionColor) ?? "grape"] ??
                      "text-white",
                    selection?.optionId === o.id &&
                      "ring-4 ring-ink ring-offset-4 ring-offset-paper",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : q.type === "scale" ? (
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from(
                {
                  length:
                    (q.settings.scaleMax ?? 5) - (q.settings.scaleMin ?? 1) + 1,
                },
                (_, i) => i + (q.settings.scaleMin ?? 1),
              ).map((n) => (
                <button
                  key={n}
                  onClick={() => setSelection({ numberValue: n })}
                  aria-pressed={selection?.numberValue === n}
                  className={cn(
                    "flex size-14 items-center justify-center rounded-2xl border-2 border-ink bg-paper-2 font-display text-xl font-extrabold text-ink shadow-pop transition-transform hover:-translate-y-0.5",
                    selection?.numberValue === n && "ring-4 ring-grape",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) lock({ textValue: text.trim() });
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
                Lock in my answer
              </button>
            </form>
          )}
          {(q.options.length > 0 || q.type === "scale") && (
            <div className="mt-6 rounded-2xl bg-paper/95 p-3 text-center">
              <button
                disabled={!selection || remaining <= 0}
                onClick={() => selection && lock(selection)}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-ink font-display text-lg font-bold text-white shadow-pop disabled:opacity-40"
              >
                <Check className="size-5" />
                Lock in my answer
              </button>
              <p className="mt-3 text-xs text-ink-soft">
                Change your pick until you lock it in. Results stay hidden until
                the timer ends.
              </p>
            </div>
          )}
        </fieldset>
      )}
      {!answered && remaining <= 0 && (
        <p role="status" className="mt-4 text-center font-bold">
          Time’s up. The room reveal is on its way.
        </p>
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
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      <p className="mb-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">
        Round {q.index + 1} · the room reveal
      </p>
      {scored && result?.revealed && (
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
            {result.isCorrect
              ? `${["Right on.", "You had that one.", "Nicely spotted.", "That’s the one!"][q.index % 4]} +${result.pointsAwarded}`
              : [
                  "A plot twist. Next round?",
                  "One to remember.",
                  "Close the gap next round.",
                  "Now you know.",
                ][q.index % 4]}
          </h2>
        </div>
      )}

      {result && (result.attackStolen || result.attackBlocked || result.attackedLoss) ? (
        <div role="status" className="mb-5 rounded-2xl border border-ink/15 bg-sun/15 p-3 text-center text-sm font-bold text-ink">
          {result.attackBlocked ? "Your attack hit a shield. No points moved." : null}
          {!result.attackBlocked && result.attackStolen ? `Your attack stole ${result.attackStolen} points.` : null}
          {result.attackedLoss ? ` An attack took ${result.attackedLoss} points from you.` : null}
        </div>
      ) : null}

      <h1 className="font-display text-xl font-bold text-ink">{q.prompt}</h1>
      {q.type === "word_cloud" && (
        <WordCloud values={snap.reveal?.textValues ?? []} />
      )}
      {q.type === "open_text" && (
        <div className="mt-4 space-y-2">
          {snap.reveal?.textValues.map((text, i) => (
            <p
              key={i}
              className="rounded-xl border border-ink/15 bg-paper-2 p-3 text-sm"
            >
              {text}
            </p>
          ))}
        </div>
      )}
      {q.type === "scale" && (
        <p className="mt-5 text-center font-display text-xl">
          Room average:{" "}
          <strong>
            {snap.reveal?.numberAverage?.toFixed(1) ?? "No responses yet"}
          </strong>
        </p>
      )}
      {q.options.length > 0 && (
        <div className="mt-3 space-y-2">
          {q.options.map((o) => {
            const tally = snap.reveal?.tallies.find((t) => t.optionId === o.id);
            const total = snap.reveal?.totalAnswers ?? 0;
            const pct =
              total > 0 ? Math.round(((tally?.count ?? 0) / total) * 100) : 0;
            const isCorrect = o.id === correctId;
            return (
              <div key={o.id}>
                <div className="flex items-center justify-between text-sm font-semibold text-ink">
                  <span className="flex items-center gap-1.5">
                    {isCorrect && (
                      <Check className="size-4 text-mint" strokeWidth={3} />
                    )}
                    {o.label}
                  </span>
                  <span className="text-ink-soft">{pct}%</span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2">
                  <div
                    className={cn("h-full", isCorrect ? "bg-mint" : "bg-grape")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mine && (
        <p className="mt-5 text-center font-display text-ink-soft">
          You are <span className="font-extrabold text-ink">#{mine.rank}</span>{" "}
          with <span className="font-extrabold text-ink">{mine.score}</span>
        </p>
      )}
      {snap.leaderboard.length > 0 && (
        <div className="mt-6 rounded-2xl border-2 border-ink/15 bg-white/70 p-4">
          <h3 className="font-display text-lg font-extrabold">Standings after this round</h3>
          <div className="mt-2 space-y-1.5">
            {snap.leaderboard.slice(0, 5).map((entry) => (
              <div key={entry.participantId} className={cn("flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm", entry.participantId === meId && "bg-grape/10")}>
                <span className="w-5 font-bold tabular-nums">{entry.rank}</span>
                <Avatar name={entry.nickname} color={entry.avatarColor} src={entry.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate font-semibold">{entry.nickname}</span>
                <span className="font-bold tabular-nums">{entry.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function FinalBoard({
  snap,
  meId,
  mine,
  results,
}: {
  snap: PlayerSnapshot;
  meId: string;
  mine?: { rank: number; score: number };
  results: Results | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-5 text-center shadow-pop-lg sm:p-8"
    >
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border-2 border-ink bg-sun">
        <Trophy className="size-8 text-ink" />
      </div>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-ink">
        Final results
      </h1>
      {mine && (
        <p className="mt-2 text-ink-soft">
          You placed <span className="font-bold text-ink">#{mine.rank}</span>{" "}
          with <span className="font-bold text-ink">{mine.score}</span>
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
              {e.nickname}
            </span>
            <span className="font-display font-extrabold text-ink">
              {e.score}
            </span>
          </div>
        ))}
      </div>
      {!snap.leaderboard.length && (
        <p className="mt-5 text-sm text-ink-soft">The host chose to keep the final standings private.</p>
      )}
      <AnswerReview results={results} />
    </motion.div>
  );
}

function JoinForm({
  onJoin,
  quiz,
}: {
  onJoin: (
    nickname: string,
    color: string,
    photo: File | null,
  ) => Promise<void>;
  quiz: SessionPublic["quiz"];
}) {
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState<string>(OPTION_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onJoin(nickname.trim(), color, photo);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn’t join. Try again.",
      );
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
      <QuizCover quiz={quiz} />
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-grape">
        Live room · {quiz.title}
      </p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
        Make an entrance.
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Pick the name your room will cheer for.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <input
          aria-label="Your nickname"
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
              color === c
                ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper"
                : "border-ink/30",
            )}
          />
        ))}
      </div>
      <AvatarChoice
        name={nickname}
        color={color}
        file={photo}
        onChange={setPhoto}
      />
      <button
        type="submit"
        disabled={!nickname.trim() || busy}
        className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop disabled:opacity-50"
      >
        {busy ? "Making room for you…" : "I’m in — join the room"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-grape-dark">
          {error}
        </p>
      )}
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
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-5 text-center shadow-pop-lg sm:p-8"
    >
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        {title}
      </h1>
      <p className="mt-2 text-ink-soft">{body}</p>
      {children}
    </motion.div>
  );
}
