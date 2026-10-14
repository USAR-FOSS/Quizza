"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { createQuiz } from "@/lib/actions/quiz";
import { COVER_ICONS, THEMES } from "@/lib/quiz-constants";
import { coverIcon } from "@/components/ui/quiz-icons";
import { cn } from "@/lib/utils";

export function NewQuizForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string>(COVER_ICONS[0]);
  const [theme, setTheme] = useState<string>(THEMES[0].key);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || pending) return;
    start(async () => {
      const id = await createQuiz({ title: title.trim(), coverIcon: icon, theme });
      router.push(`/build/${id}`);
    });
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-lg rounded-3xl border-2 border-ink bg-paper p-7 shadow-pop-lg sm:p-9"
    >
      <span className="inline-flex items-center rounded-full border-2 border-ink bg-sun px-3 py-1 font-display text-xs font-bold uppercase tracking-widest text-ink">
        New quiz
      </span>

      <label className="mt-6 block font-display text-sm font-bold text-ink-soft">
        Title
      </label>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Friday trivia"
        maxLength={120}
        className="mt-2 w-full rounded-2xl border-2 border-ink bg-paper-2 px-4 py-3 font-display text-xl font-bold text-ink placeholder:text-ink-soft/50 focus:bg-white focus:outline-none"
      />

      <label className="mt-6 block font-display text-sm font-bold text-ink-soft">
        Cover icon
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {COVER_ICONS.map((key) => {
          const Icon = coverIcon(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setIcon(key)}
              aria-label={`Cover ${key}`}
              className={cn(
                "flex size-11 items-center justify-center rounded-xl border-2 transition-transform hover:-translate-y-0.5",
                icon === key
                  ? "border-ink bg-white shadow-pop"
                  : "border-transparent bg-paper-2",
              )}
            >
              <Icon className="size-5 text-ink" />
            </button>
          );
        })}
      </div>

      <label className="mt-6 block font-display text-sm font-bold text-ink-soft">
        Theme
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTheme(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-xl border-2 px-3 py-2 font-display text-sm font-bold transition-transform hover:-translate-y-0.5",
              theme === t.key
                ? "border-ink bg-white shadow-pop"
                : "border-transparent bg-paper-2 text-ink-soft",
            )}
          >
            <span className={cn("size-4 rounded-full border-2 border-ink", t.swatch)} />
            {t.label}
          </button>
        ))}
      </div>

      <button
        type="submit"
        disabled={!title.trim() || pending}
        className="group mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-grape font-display text-lg font-bold text-white shadow-pop transition-transform duration-150 ease-[var(--ease-bounce)] hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
      >
        {pending ? "Creating" : "Start building"}
        {!pending && (
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
        )}
      </button>
    </motion.form>
  );
}
