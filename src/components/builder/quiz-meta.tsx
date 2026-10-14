"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { COVER_ICONS, THEMES } from "@/lib/quiz-constants";
import { coverIcon } from "@/components/ui/quiz-icons";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  coverIcon: string;
  theme: string;
  onChange: (patch: { title?: string; coverIcon?: string; theme?: string }) => void;
};

export function QuizMeta({ title, coverIcon: cover, theme, onChange }: Props) {
  const [open, setOpen] = useState<"icon" | "theme" | null>(null);
  const activeTheme = THEMES.find((t) => t.key === theme) ?? THEMES[0];
  const CoverIcon = coverIcon(cover);

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
      {/* cover icon picker */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen(open === "icon" ? null : "icon")}
          className="flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-paper-2 transition-transform hover:-translate-y-0.5"
          aria-label="Change cover icon"
        >
          <CoverIcon className="size-5 text-ink" />
        </button>
        {open === "icon" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="grid grid-cols-6 gap-1">
              {COVER_ICONS.map((key) => {
                const Icon = coverIcon(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onChange({ coverIcon: key });
                      setOpen(null);
                    }}
                    aria-label={key}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-paper-2",
                      cover === key && "bg-paper-2 ring-2 ring-grape",
                    )}
                  >
                    <Icon className="size-5 text-ink" />
                  </button>
                );
              })}
            </div>
          </Popover>
        )}
      </div>

      {/* title */}
      <input
        value={title}
        onChange={(e) => onChange({ title: e.target.value })}
        maxLength={120}
        placeholder="Untitled quiz"
        className="min-w-0 max-w-sm flex-1 rounded-lg bg-transparent px-1 py-1 text-center font-display text-lg font-extrabold tracking-tight text-ink placeholder:text-ink-soft/40 focus:bg-paper-2 focus:outline-none sm:text-xl"
      />

      {/* theme picker */}
      <div className="relative hidden shrink-0 sm:block">
        <button
          type="button"
          onClick={() => setOpen(open === "theme" ? null : "theme")}
          className="flex h-10 items-center gap-1.5 rounded-xl border-2 border-ink bg-paper-2 px-2.5 transition-transform hover:-translate-y-0.5"
          aria-label="Change theme"
        >
          <span className={cn("size-4 rounded-full border-2 border-ink", activeTheme.swatch)} />
          <ChevronDown className="size-4 text-ink-soft" />
        </button>
        {open === "theme" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="flex flex-col gap-1">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    onChange({ theme: t.key });
                    setOpen(null);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-left font-display text-sm font-bold transition-colors hover:bg-paper-2",
                    theme === t.key ? "text-ink" : "text-ink-soft",
                  )}
                >
                  <span className={cn("size-4 rounded-full border-2 border-ink", t.swatch)} />
                  {t.label}
                </button>
              ))}
            </div>
          </Popover>
        )}
      </div>
    </div>
  );
}

function Popover({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div className="absolute left-1/2 top-12 z-50 -translate-x-1/2 rounded-2xl border-2 border-ink bg-paper p-2 shadow-pop-lg">
        {children}
      </div>
    </>
  );
}
