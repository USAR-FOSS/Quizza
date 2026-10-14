"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

/**
 * The signature Mentimeter move: a big friendly box that asks for a room code.
 * Six single-digit cells, auto-advance, paste-aware. On submit it hands off to
 * the player route (built next) - for now that's /play/[code].
 */
export function JoinCard() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [shake, setShake] = useState(false);
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
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    router.push(`/play/${code}`);
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 24, rotate: -1 }}
      animate={{
        opacity: 1,
        y: 0,
        rotate: -1,
        x: shake ? [0, -8, 8, -6, 6, 0] : 0,
      }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-6 shadow-pop-lg sm:p-8"
    >
      <p className="font-display text-sm font-bold uppercase tracking-widest text-grape">
        Join a room
      </p>
      <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
        Enter the code
      </h2>

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
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label={`Code digit ${i + 1}`}
            className="h-14 w-full min-w-0 rounded-xl border-2 border-ink bg-paper-2 text-center font-mono text-2xl font-bold text-ink caret-grape transition-colors focus:bg-white focus:outline-none sm:h-16 sm:text-3xl"
          />
        ))}
      </div>

      <button
        type="submit"
        className="group mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop transition-transform duration-150 ease-[var(--ease-bounce)] hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        Join
        <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
      </button>

      <p className="mt-3 text-center text-sm text-ink-soft">
        No account needed. Just a nickname.
      </p>
    </motion.form>
  );
}
