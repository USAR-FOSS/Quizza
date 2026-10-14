"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Calendar, Radio, Copy, Check, BarChart3 } from "lucide-react";
import { api, ApiClientError, type SessionCreated } from "@/lib/api-client";
import { formatJoinCode } from "@/lib/codes";
import { cn } from "@/lib/utils";

type Mode = "scheduled" | "live";

/** Default a datetime-local input value from an offset in hours. */
function localValue(offsetHours: number): string {
  const d = new Date(Date.now() + offsetHours * 3600_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Launch({
  quizId,
  title,
  questionCount,
}: {
  quizId: string;
  title: string;
  questionCount: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("scheduled");
  const [opensAt, setOpensAt] = useState(localValue(0));
  const [closesAt, setClosesAt] = useState(localValue(4));
  const [session, setSession] = useState<SessionCreated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const body =
        mode === "scheduled"
          ? {
              quizId,
              mode,
              opensAt: new Date(opensAt).toISOString(),
              closesAt: new Date(closesAt).toISOString(),
            }
          : { quizId, mode };
      const created = await api.createSession(body);
      // the host holds the control key; keep it to drive live mode and to view
      // full (ungated) results later.
      localStorage.setItem(`quizza:host:${created.code}`, created.hostToken);
      if (created.mode === "live") {
        router.push(`/host/${created.code}`);
        return;
      }
      setSession(created);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the session");
    } finally {
      setBusy(false);
    }
  }

  if (session) return <Created session={session} title={title} />;

  const noQuestions = questionCount === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-lg rounded-3xl border-2 border-ink bg-paper p-7 shadow-pop-lg"
    >
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-ink-soft">
        {questionCount} {questionCount === 1 ? "question" : "questions"}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <ModeCard
          active={mode === "scheduled"}
          onClick={() => setMode("scheduled")}
          icon={<Calendar className="size-5" />}
          label="Scheduled"
          blurb="Open for a window, self-paced"
        />
        <ModeCard
          active={mode === "live"}
          onClick={() => setMode("live")}
          icon={<Radio className="size-5" />}
          label="Live"
          blurb="Host-driven, in sync"
        />
      </div>

      {mode === "scheduled" ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-display text-sm font-bold text-ink-soft">Opens</span>
            <input
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-ink bg-paper-2 px-3 py-2 font-semibold text-ink focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-display text-sm font-bold text-ink-soft">Closes</span>
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-ink bg-paper-2 px-3 py-2 font-semibold text-ink focus:bg-white focus:outline-none"
            />
          </label>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border-2 border-dashed border-ink/20 p-4 text-center text-sm text-ink-soft">
          Live sessions get a room code now. The live presenter screen is coming next.
        </p>
      )}

      {noQuestions && (
        <p className="mt-4 rounded-xl border-2 border-coral bg-coral/10 p-3 text-center text-sm font-semibold text-ink">
          Add at least one question before launching.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border-2 border-coral bg-coral/10 p-3 text-center text-sm font-semibold text-ink">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <Link
          href={`/build/${quizId}`}
          className="flex h-12 flex-1 items-center justify-center rounded-2xl border-2 border-ink bg-paper font-display font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
        >
          Back to editor
        </Link>
        <button
          onClick={create}
          disabled={busy || noQuestions}
          className="flex h-12 flex-1 items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {busy ? "Creating" : "Launch"}
        </button>
      </div>
    </motion.div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  label,
  blurb,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  blurb: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-2xl border-2 p-4 text-left transition-transform hover:-translate-y-0.5",
        active ? "border-ink bg-white shadow-pop" : "border-ink/20 bg-paper-2",
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-grape text-white">
        {icon}
      </span>
      <span className="mt-2 block font-display font-bold text-ink">{label}</span>
      <span className="block text-xs text-ink-soft">{blurb}</span>
    </button>
  );
}

function Created({ session, title }: { session: SessionCreated; title: string }) {
  const [copied, setCopied] = useState(false);
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/play/${session.code}` : "";

  function copy() {
    navigator.clipboard?.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-lg rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop-lg"
    >
      <p className="font-display text-sm font-bold uppercase tracking-widest text-ink-soft">
        {title}
      </p>
      <p className="mt-6 font-display text-sm font-bold uppercase tracking-widest text-grape">
        Join at this code
      </p>
      <p className="mt-2 font-mono text-6xl font-extrabold tracking-wider text-ink">
        {formatJoinCode(session.code)}
      </p>

      <button
        onClick={copy}
        className="mx-auto mt-6 flex items-center gap-2 rounded-xl border-2 border-ink bg-paper-2 px-4 py-2 font-display text-sm font-bold text-ink transition-transform hover:-translate-y-0.5"
      >
        {copied ? <Check className="size-4 text-mint" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy join link"}
      </button>

      {session.mode === "scheduled" && session.opensAt && session.closesAt && (
        <p className="mt-4 text-sm text-ink-soft">
          Open {new Date(session.opensAt).toLocaleString()} to{" "}
          {new Date(session.closesAt).toLocaleString()}
        </p>
      )}

      <div className="mt-7 flex gap-3">
        <Link
          href={`/play/${session.code}`}
          className="flex h-12 flex-1 items-center justify-center rounded-2xl border-2 border-ink bg-paper font-display font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
        >
          Open player
        </Link>
        <Link
          href={`/results/${session.code}`}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5"
        >
          <BarChart3 className="size-4" />
          Results
        </Link>
      </div>
    </motion.div>
  );
}
