"use client";
import { useEffect, useRef, useState } from "react";
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
  const [announcement, setAnnouncement] = useState("");
  const announcedRef = useRef<Set<string>>(new Set());
  const prevStartedAtRef = useRef<string | null>(startedAt);

  useEffect(() => {
    if (prevStartedAtRef.current !== startedAt) {
      prevStartedAtRef.current = startedAt;
      announcedRef.current = new Set();
      setAnnouncement("");
    }
  }, [startedAt]);

  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, (deadline - Date.now()) / 1000);
      setRemaining(rem);

      const ceil = Math.ceil(rem);
      if (rem <= 0) {
        if (!announcedRef.current.has("expired")) {
          announcedRef.current.add("expired");
          setAnnouncement("Time expired.");
        }
      } else if (ceil <= 5) {
        if (!announcedRef.current.has("5s")) {
          announcedRef.current.add("5s");
          setAnnouncement("5 seconds remaining.");
        }
      } else if (ceil <= 10 && seconds > 15) {
        if (!announcedRef.current.has("10s")) {
          announcedRef.current.add("10s");
          setAnnouncement("10 seconds remaining.");
        }
      } else if (!announcedRef.current.has("start")) {
        announcedRef.current.add("start");
        setAnnouncement(`Round started. ${ceil} seconds remaining.`);
      }
    };

    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [deadline, seconds]);

  return (
    <div className="mt-6 rounded-3xl border-2 border-ink bg-paper p-4 shadow-pop">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
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
          aria-hidden="true"
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

