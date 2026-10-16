"use client";
import { useEffect, useState } from "react";
import { QuizBuddy } from "@/components/ui/quiz-buddy";
import { cn } from "@/lib/utils";

export function RoundClock({
  startedAt,
  seconds,
  clockOffsetMs = 0,
}: {
  startedAt: string | null;
  seconds: number;
  clockOffsetMs?: number;
}) {
  const deadline =
    new Date(startedAt ?? 0).getTime() + seconds * 1000 - clockOffsetMs;
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, (deadline - Date.now()) / 1000),
  );
  useEffect(() => {
    const tick = () =>
      setRemaining(Math.max(0, (deadline - Date.now()) / 1000));
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [deadline]);
  return (
    <div className="mt-6 rounded-3xl border-2 border-ink bg-paper p-4 shadow-pop">
      <div className="flex items-center gap-3">
        <QuizBuddy mood="thinking" className="w-20 shrink-0" />
        <div className="flex-1">
          <p className="font-display text-lg font-bold">
            {remaining
              ? "Keep your poker face."
              : "The answers are coming out."}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Answers stay sealed until the timer ends. You choose when the next
            round starts.
          </p>
        </div>
        <span
          aria-label={`${Math.ceil(remaining)} seconds remaining`}
          className={cn(
            "font-display text-5xl font-extrabold tabular-nums",
            remaining <= 5 ? "text-grape-dark" : "text-ink",
          )}
        >
          {Math.ceil(remaining)}
          <span className="text-lg">s</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
        <div
          className={cn(
            "h-full transition-[width] duration-200",
            remaining <= 5 ? "bg-coral" : "bg-grape",
          )}
          style={{ width: `${(remaining / seconds) * 100}%` }}
        />
      </div>
    </div>
  );
}
