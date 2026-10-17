"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Radio, Loader2 } from "lucide-react";

/**
 * The signature Mentimeter move: a big friendly box that asks for a room code.
 * Six single-digit cells, auto-advance, paste-aware. On submit it hands off to
 * the player route (built next) - for now that's /play/[code].
 */
export function JoinCard() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [shake, setShake] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");
  const complete = code.length === 6;

  function setAt(i: number, v: string) {
    const next = [...digits];
    next[i] = v;
    setDigits(next);
  }

  function handleChange(i: number, raw: string) {
    const v = raw.replace(/\D/g, "");
    if (!v) {
      setAt(i, "");
      return;
    }
    // handle paste of a full code
    if (v.length > 1) {
      const chars = v.slice(0, 6).split("");
      const next = Array(6)
        .fill("")
        .map((_, idx) => chars[idx] ?? "");
      setDigits(next);
      inputs.current[Math.min(chars.length, 5)]?.focus();
      return;
    }
    setAt(i, v);
    if (i < 5) inputs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) inputs.current[i + 1]?.focus();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) {
      setShake(true);
      setError("Enter the six-digit room code.");
      inputs.current[digits.findIndex((digit) => !digit)]?.focus();
      setTimeout(() => setShake(false), 500);
      return;
    }
    setError("");
    setJoining(true);
    router.push(`/play/${code}`);
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 24 }}
      animate={{
        opacity: 1,
        y: 0,
        x: shake ? [0, -8, 8, -6, 6, 0] : 0,
      }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-6 shadow-pop-lg sm:p-8"
    >
      <p className="eyebrow text-grape">
        <Radio className="size-4" />
        Join a room
      </p>
      <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink">
        Enter room code
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        Ask the host for the six-digit code.
      </p>

      <div className="mt-5 flex justify-between gap-1.5 sm:gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(event) => event.target.select()}
            onPaste={(event) => {
              event.preventDefault();
              handleChange(i, event.clipboardData.getData("text"));
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label={`Code digit ${i + 1}`}
            className="h-14 w-full min-w-0 rounded-xl border-2 border-ink/20 bg-paper-2/60 text-center font-mono text-2xl font-bold text-ink caret-grape transition-colors focus:border-grape focus:bg-white sm:h-16 sm:text-3xl"
          />
        ))}
      </div>

      <button
        type="submit"
        disabled={joining}
        className="group mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop transition-transform duration-150 ease-[var(--ease-bounce)] hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        {joining ? (
          <>
            Finding your room <Loader2 className="size-5 animate-spin" />
          </>
        ) : (
          <>
            Let me in{" "}
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-grape-dark">
          {error}
        </p>
      )}
      <p className="mt-5 text-center text-xs text-ink-soft">
        Just a nickname. No sign-up, no fuss.
      </p>
    </motion.form>
  );
}
