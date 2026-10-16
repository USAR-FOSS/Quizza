"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, Clock, Radio, Trophy, LogIn } from "lucide-react";
import {
  api,
  ApiClientError,
  type AnswerResult,
  type QuestionPublic,
  type Results,
  type SessionPublic,
} from "@/lib/api-client";
import {
  OPTION_COLORS,
  COLOR_BG,
  COLOR_TEXT,
  type OptionColor,
} from "@/lib/quiz-constants";
import { Avatar } from "@/components/ui/avatar";
import { LivePlayer } from "@/components/live/live-player";
import { cn } from "@/lib/utils";
import { QuestionMedia } from "@/components/ui/question-media";
import { PowerupPicker } from "@/components/live/powerup-picker";
import type { Powerup } from "@/lib/powerups";
import { LoadingState } from "@/components/ui/loading-state";
import { AvatarChoice } from "@/components/ui/avatar-choice";
import { uploadImage } from "@/lib/upload-client";
import { QuizCover, RoomTheme } from "./room-theme";
import { QuizBuddy } from "@/components/ui/quiz-buddy";

type Identity = {
  clientToken: string;
  participantId: string;
  nickname: string;
  avatarColor: string;
  avatarUrl?: string | null;
  photoWarning?: string;
};

type Phase =
  | "loading"
  | "notfound"
  | "live-unsupported"
  | "closed"
  | "signin"
  | "join"
  | "intro"
  | "question"
  | "feedback"
  | "done";

const storeKey = (code: string) => `quizza:player:${code}`;

export function Player({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionPublic | null>(null);
  const [me, setMe] = useState<Identity | null>(null);
  const [questions, setQuestions] = useState<QuestionPublic[]>([]);
  const [index, setIndex] = useState(0);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [note, setNote] = useState<string>("");
  const [live, setLive] = useState(false);
  const [view, setView] = useState<{
    questionId: string;
    viewToken: string;
    startedAt: string;
  }>();
  const viewToken =
    view?.questionId === questions[index]?.id ? view?.viewToken : undefined;
  const startedAt =
    view?.questionId === questions[index]?.id ? view?.startedAt : undefined;
  const [usedPowerups, setUsedPowerups] = useState<Powerup[]>([]);

  // load session, then decide the entry phase
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.getSession(code);
        if (!alive) return;
        setSession(s);
        if (s.mode === "live") {
          setLive(true);
          return;
        }
        const stored = localStorage.getItem(storeKey(code));
        const identity: Identity | null = stored ? JSON.parse(stored) : null;
        if (identity) {
          setMe(identity);
          await loadQuestions(identity.clientToken);
        } else {
          setPhase("join");
        }
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiClientError && err.status === 404)
          setPhase("notfound");
        else setPhase("notfound");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const loadQuestions = useCallback(
    async (clientToken: string) => {
      try {
        const {
          questions: qs,
          answered,
          usedPowerups,
        } = await api.getQuestions(code, clientToken);
        setUsedPowerups(usedPowerups);
        setQuestions(qs);
        // resume: start at the first question this participant has not answered
        const answeredSet = new Set(answered);
        const firstUnanswered = qs.findIndex((q) => !answeredSet.has(q.id));
        if (qs.length > 0 && firstUnanswered === -1) {
          // already finished: go straight to results
          setIndex(qs.length);
          setPhase("done");
          try {
            setResults(await api.getResults(code));
          } catch {
            setResults(null);
          }
        } else {
          setIndex(Math.max(0, firstUnanswered));
          setPhase("intro");
        }
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "session_not_open") {
          setPhase("closed");
        } else if (
          err instanceof ApiClientError &&
          err.code === "not_scheduled"
        ) {
          setPhase("live-unsupported");
        } else {
          setPhase("closed");
        }
      }
    },
    [code],
  );

  async function handleJoin(
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
      await loadQuestions(identity.clientToken);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "signin_required") {
        setPhase("signin");
      } else if (
        err instanceof ApiClientError &&
        err.code === "session_not_open"
      ) {
        setPhase("closed");
      } else {
        throw err;
      }
    }
  }

  // fetch a server-timestamped view token when a question is shown, so response
  // time is anchored on the server (not the client clock).
  useEffect(() => {
    if (phase !== "question" || !me || !questions[index]) return;
    let alive = true;
    api
      .getViewToken(code, questions[index].id, me.clientToken)
      .then((r) => {
        if (alive) setView({ questionId: questions[index].id, ...r });
      })
      .catch(() => {
        if (alive)
          setNote(
            "Couldn’t start the timer. Check your connection and reload to retry.",
          );
      });
    return () => {
      alive = false;
    };
  }, [phase, index, me, questions, code]);

  async function submit(payload: {
    optionId?: string;
    textValue?: string;
    numberValue?: number;
    powerup?: Powerup;
  }) {
    if (!me) return;
    const q = questions[index];
    try {
      const result = await api.submitAnswer(code, {
        questionId: q.id,
        clientToken: me.clientToken,
        viewToken,
        ...payload,
      });
      setLastResult(result);
      if (payload.powerup)
        setUsedPowerups((used) => [...used, payload.powerup!]);
      setPhase("feedback");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "already_answered") {
        advance();
      } else {
        setNote(
          err instanceof ApiClientError ? err.message : "Something went wrong",
        );
        throw err;
      }
    }
  }

  async function advance() {
    setNote("");
    setLastResult(null);
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setPhase("question");
    } else {
      setPhase("done");
      try {
        setResults(await api.getResults(code));
      } catch {
        setResults(null);
      }
    }
  }

  const accent = session?.quiz.theme ?? "grape";

  if (live) return <LivePlayer code={code} />;

  return (
    <RoomTheme
      theme={accent}
      className="flex min-h-screen flex-col bg-paper bg-dots"
    >
      {me?.photoWarning && (
        <p role="status" className="bg-sun/20 p-3 text-center text-sm">
          {me.photoWarning}
        </p>
      )}
      <TopBar session={session} me={me} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-8">
        <AnimatePresence mode="wait">
          {phase === "loading" && (
            <Centered key="l">
              <LoadingState label="Finding your next good question…" />
            </Centered>
          )}

          {phase === "notfound" && (
            <Message
              key="nf"
              title="Room not found"
              body={`No active room for code ${code}.`}
            />
          )}

          {phase === "live-unsupported" && (
            <Message
              key="live"
              icon={<Radio className="size-8 text-ink" />}
              title="This is a live room"
              body="Live rooms are run by a host on the presenter screen. The live player is coming next."
            />
          )}

          {phase === "closed" && (
            <Message
              key="cl"
              icon={<Clock className="size-8 text-ink" />}
              title="Not open right now"
              body={windowText(session)}
            >
              <button
                onClick={() => window.location.reload()}
                className="mt-5 rounded-xl border-2 border-ink bg-grape px-5 py-3 font-bold text-white shadow-pop"
              >
                Check the room again
              </button>
            </Message>
          )}

          {phase === "signin" && (
            <motion.div
              key="signin"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg"
            >
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border-2 border-ink bg-paper-2">
                <LogIn className="size-8 text-ink" />
              </div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
                Sign in to play
              </h1>
              <p className="mt-2 text-ink-soft">
                This quiz allows one attempt per person, so it needs you signed
                in.
              </p>
              <Link
                href={`/login?next=${encodeURIComponent(`/play/${code}`)}`}
                className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape px-6 font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5"
              >
                <LogIn className="size-5" />
                Sign in
              </Link>
            </motion.div>
          )}

          {phase === "join" && (
            <JoinCard key="join" quiz={session?.quiz} onJoin={handleJoin} />
          )}

          {phase === "intro" && session && (
            <Intro
              key="intro"
              title={session.quiz.title}
              count={questions.length}
              onStart={() => setPhase("question")}
            />
          )}

          {phase === "question" && questions[index] && (
            <QuestionView
              key={`q-${questions[index].id}`}
              question={questions[index]}
              index={index}
              total={questions.length}
              onSubmit={submit}
              onTimeout={advance}
              ready={Boolean(viewToken)}
              startedAt={startedAt}
              powerups={Boolean(session?.powerups)}
              usedPowerups={usedPowerups}
            />
          )}

          {phase === "feedback" && (
            <Feedback
              key={`fb-${index}`}
              result={lastResult}
              note={note}
              last={index + 1 >= questions.length}
              index={index}
              onNext={advance}
            />
          )}

          {phase === "done" && <Done key="done" results={results} me={me} />}
        </AnimatePresence>
      </main>
    </RoomTheme>
  );
}

/* ------------------------------ pieces ------------------------------ */

function TopBar({
  session,
  me,
}: {
  session: SessionPublic | null;
  me: Identity | null;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b-2 border-ink/10 px-5">
      <span className="font-display text-sm font-bold text-ink-soft">
        {session ? session.quiz.title : "quizza"}
      </span>
      {me && (
        <span className="flex items-center gap-2">
          <Avatar
            name={me.nickname}
            color={me.avatarColor}
            src={me.avatarUrl}
            size="sm"
          />
          <span className="font-display text-sm font-bold text-ink">
            {me.nickname}
          </span>
        </span>
      )}
    </header>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 items-center justify-center"
    >
      {children}
    </motion.div>
  );
}

function Message({
  title,
  body,
  icon,
  children,
}: {
  title: string;
  body: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg"
    >
      {icon && (
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border-2 border-ink bg-paper-2">
          {icon}
        </div>
      )}
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        {title}
      </h1>
      <p className="mt-2 text-ink-soft">{body}</p>
      {children}
    </motion.div>
  );
}

function JoinCard({
  quiz,
  onJoin,
}: {
  quiz?: SessionPublic["quiz"];
  onJoin: (
    nickname: string,
    color: string,
    photo: File | null,
  ) => Promise<void>;
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
        err instanceof Error ? err.message : "Couldn’t join. Please try again.",
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
      exit={{ opacity: 0 }}
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-7 shadow-pop-lg"
    >
      {quiz && <QuizCover quiz={quiz} />}
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-grape">
        Scheduled · play at your pace
      </p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
        Your next little challenge.
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        No waiting room here. Choose a name, then start when you’re ready.
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
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
      >
        {busy ? "Getting you ready…" : "Get started"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-grape-dark">
          {error}
        </p>
      )}
    </motion.form>
  );
}

function Intro({
  title,
  count,
  onStart,
}: {
  title: string;
  count: number;
  onStart: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg"
    >
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
        {title}
      </h1>
      <p className="mt-2 text-ink-soft">
        {count} {count === 1 ? "question" : "questions"}. Answer fast and
        accurately.
      </p>
      <button
        onClick={onStart}
        className="mt-7 flex h-14 w-full items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        Start
      </button>
    </motion.div>
  );
}

function QuestionView({
  question,
  index,
  total,
  onSubmit,
  onTimeout,
  ready,
  startedAt,
  powerups,
  usedPowerups,
}: {
  question: QuestionPublic;
  index: number;
  total: number;
  onSubmit: (p: {
    optionId?: string;
    textValue?: string;
    numberValue?: number;
    powerup?: Powerup;
  }) => Promise<void>;
  onTimeout: () => void;
  ready: boolean;
  startedAt?: string;
  powerups: boolean;
  usedPowerups: Powerup[];
}) {
  const startRef = useRef<number>(0);
  const [remaining, setRemaining] = useState(question.timeLimitSec);
  const [text, setText] = useState("");
  const done = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [powerup, setPowerup] = useState<Powerup>();

  useEffect(() => {
    if (!startedAt) return;
    startRef.current = new Date(startedAt).getTime();
    done.current = false;
    const id = setInterval(() => {
      const left =
        question.timeLimitSec - (Date.now() - startRef.current) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0 && !done.current) {
        done.current = true;
        clearInterval(id);
        onTimeout();
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, startedAt]);

  async function pick(payload: {
    optionId?: string;
    textValue?: string;
    numberValue?: number;
  }) {
    if (done.current || !ready || busy) return;
    done.current = true;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ ...payload, powerup });
    } catch (err) {
      done.current = false;
      setError(
        err instanceof Error ? err.message : "Couldn’t submit. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const pct = (remaining / question.timeLimitSec) * 100;
  const s = question.settings as { scaleMin?: number; scaleMax?: number };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full"
    >
      <div className="flex items-center justify-between text-sm font-bold text-ink-soft">
        <span>
          Question {index + 1} of {total}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-4" />
          {Math.ceil(remaining)}s
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2">
        <div
          className="h-full bg-grape transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <h1 className="mt-6 font-display text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
        {question.prompt}
      </h1>
      <QuestionMedia url={question.mediaUrl} />
      {powerups &&
        ["multiple_choice", "true_false"].includes(question.type) && (
          <PowerupPicker
            selected={powerup}
            used={usedPowerups}
            onChange={setPowerup}
            disabled={!ready || busy}
          />
        )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-coral/10 p-3 text-sm font-semibold"
        >
          {error}
        </p>
      )}
      {!ready && (
        <p role="status" className="mt-4 text-sm text-ink-soft">
          Preparing your question timer…
        </p>
      )}

      <fieldset
        disabled={!ready || busy || remaining <= 0}
        className="mt-6 disabled:opacity-60"
      >
        {question.options.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {question.options.map((o) => (
              <button
                key={o.id}
                onClick={() => pick({ optionId: o.id })}
                className={cn(
                  "flex min-h-16 items-center rounded-2xl border-2 border-ink px-4 py-3 text-left font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
                  COLOR_BG[(o.color as OptionColor) ?? "grape"] ?? "bg-grape",
                  COLOR_TEXT[(o.color as OptionColor) ?? "grape"] ??
                    "text-white",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : question.type === "scale" ? (
          <div className="flex flex-wrap justify-center gap-2">
            {scaleRange(s.scaleMin ?? 1, s.scaleMax ?? 5).map((n) => (
              <button
                key={n}
                onClick={() => pick({ numberValue: n })}
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
              if (text.trim()) pick({ textValue: text.trim() });
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
              className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              Submit
            </button>
          </form>
        )}
      </fieldset>
    </motion.div>
  );
}

function Feedback({
  result,
  note,
  last,
  index,
  onNext,
}: {
  result: AnswerResult | null;
  note: string;
  last: boolean;
  index: number;
  onNext: () => void;
}) {
  const correct = result?.isCorrect;
  const scored = result && result.correctOptionId !== null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg"
    >
      {note ? (
        <h1 className="font-display text-2xl font-extrabold text-ink">
          {note}
        </h1>
      ) : scored ? (
        <>
          <div
            className={cn(
              "mx-auto flex size-16 items-center justify-center rounded-2xl border-2 border-ink",
              correct ? "bg-mint" : "bg-coral",
            )}
          >
            {correct ? (
              <Check className="size-8 text-white" strokeWidth={3} />
            ) : (
              <X className="size-8 text-white" strokeWidth={3} />
            )}
          </div>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">
            {correct
              ? [
                  "Right on.",
                  "Nicely spotted.",
                  "You know your stuff.",
                  "That’s the one!",
                ][index % 4]
              : [
                  "One to remember.",
                  "A little plot twist.",
                  "Now you know.",
                  "Keep that curiosity.",
                ][index % 4]}
          </h1>
          <p className="mt-1 font-display text-lg font-bold text-grape">
            +{result?.pointsAwarded ?? 0} points
          </p>
        </>
      ) : (
        <>
          <QuizBuddy className="mx-auto w-28" mood="happy" />
          <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">
            {
              ["Your take is in.", "Added to the mix.", "Consider it noted."][
                index % 3
              ]
            }
          </h1>
          <p className="mt-1 text-ink-soft">
            {last
              ? "That’s your last response. Let’s wrap up."
              : "Ready for the next little challenge?"}
          </p>
        </>
      )}
      <button
        onClick={onNext}
        className="mt-7 flex h-14 w-full items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        {last ? "See results" : "Next question"}
      </button>
    </motion.div>
  );
}

function Done({
  results,
  me,
}: {
  results: Results | null;
  me: Identity | null;
}) {
  const mine = results?.leaderboard.find(
    (e) => e.participantId === me?.participantId,
  );
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
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-ink">
        All done
      </h1>
      {mine ? (
        <p className="mt-2 text-ink-soft">
          You scored <span className="font-bold text-ink">{mine.score}</span>{" "}
          and placed <span className="font-bold text-ink">#{mine.rank}</span> of{" "}
          {results?.totalParticipants}.
        </p>
      ) : (
        <p className="mt-2 text-ink-soft">Your answers were recorded.</p>
      )}

      {results && results.leaderboard.length > 0 && (
        <div className="mt-6 space-y-2 text-left">
          {results.leaderboard.slice(0, 5).map((e) => (
            <div
              key={e.participantId}
              className={cn(
                "flex items-center gap-3 rounded-2xl border-2 border-ink p-2.5",
                e.participantId === me?.participantId
                  ? "bg-grape/10"
                  : "bg-paper-2",
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
      )}
    </motion.div>
  );
}

/* ------------------------------ utils ------------------------------- */

function scaleRange(min: number, max: number): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

function windowText(session: SessionPublic | null): string {
  if (!session) return "This room is not open.";
  const opens = session.opensAt ? new Date(session.opensAt) : null;
  const closes = session.closesAt ? new Date(session.closesAt) : null;
  const now = Date.now();
  if (opens && now < opens.getTime()) return `Opens ${opens.toLocaleString()}.`;
  if (closes && now > closes.getTime())
    return `Closed ${closes.toLocaleString()}.`;
  return "This room is not open right now.";
}
