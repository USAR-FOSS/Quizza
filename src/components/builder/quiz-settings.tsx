"use client";

import { motion } from "motion/react";
import { X, Eye, Trophy, Users, Shuffle } from "lucide-react";
import {
  REVEAL_OPTIONS,
  LEADERBOARD_OPTIONS,
  PARTICIPATION_OPTIONS,
  revealPolicy,
  leaderboardPolicy,
  participationMode,
} from "@/lib/quiz-policy";
import type { QuizSettings } from "@/lib/db/schema-types";
import { cn } from "@/lib/utils";

export function QuizSettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: QuizSettings;
  onChange: (patch: Partial<QuizSettings>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-lg rounded-3xl border-2 border-ink bg-paper p-6 shadow-pop-lg sm:p-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Quiz settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl p-2 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <Group
          icon={<Eye className="size-4" />}
          title="Show correct answers"
          options={REVEAL_OPTIONS}
          value={revealPolicy(settings)}
          onChange={(v) => onChange({ revealAnswers: v as QuizSettings["revealAnswers"] })}
        />

        <Group
          icon={<Trophy className="size-4" />}
          title="Show leaderboard"
          options={LEADERBOARD_OPTIONS}
          value={leaderboardPolicy(settings)}
          onChange={(v) => onChange({ leaderboard: v as QuizSettings["leaderboard"] })}
        />

        <Group
          icon={<Users className="size-4" />}
          title="Who can play"
          options={PARTICIPATION_OPTIONS}
          value={participationMode(settings)}
          onChange={(v) => onChange({ participation: v as QuizSettings["participation"] })}
        />

        <div className="mt-6">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-ink-soft">
            <Shuffle className="size-4" />
            Shuffle
          </h3>
          <div className="mt-2 space-y-2">
            <Toggle
              label="Shuffle question order"
              on={settings.shuffleQuestions ?? false}
              onChange={(v) => onChange({ shuffleQuestions: v })}
            />
            <Toggle
              label="Shuffle answer options"
              on={settings.shuffleOptions ?? false}
              onChange={(v) => onChange({ shuffleOptions: v })}
            />
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-7 flex h-12 w-full items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          Done
        </button>
      </motion.div>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between rounded-2xl border-2 border-ink/20 bg-paper-2 p-3 text-left transition-colors hover:border-ink/40"
    >
      <span className="font-display font-bold text-ink">{label}</span>
      <span
        className={cn(
          "flex h-6 w-10 shrink-0 items-center rounded-full border-2 border-ink p-0.5 transition-colors",
          on ? "bg-grape" : "bg-paper",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-ink transition-transform",
            on ? "translate-x-4 bg-white" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

function Group({
  icon,
  title,
  options,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  options: { value: string; label: string; blurb: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-6">
      <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-ink-soft">
        {icon}
        {title}
      </h3>
      <div className="mt-2 space-y-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left transition-transform hover:-translate-y-0.5",
              value === o.value
                ? "border-ink bg-white shadow-pop"
                : "border-ink/20 bg-paper-2",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-ink",
                value === o.value ? "bg-grape" : "bg-paper",
              )}
            >
              {value === o.value && <span className="size-2 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className="block font-display font-bold text-ink">{o.label}</span>
              <span className="block text-sm text-ink-soft">{o.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
