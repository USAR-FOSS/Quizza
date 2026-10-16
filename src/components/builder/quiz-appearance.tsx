"use client";
import { useState } from "react";
import { Palette } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ui/image-upload";
import { QuestionMedia } from "@/components/ui/question-media";
import { COVER_ICON_MAP } from "@/components/ui/quiz-icons";
import { COVER_ICONS, THEMES } from "@/lib/quiz-constants";
import type { QuizSettings } from "@/lib/db/schema-types";
import { cn } from "@/lib/utils";

export function QuizAppearance({
  quizId,
  settings,
  theme,
  coverIcon,
  onSettings,
  onTheme,
  onIcon,
}: {
  quizId: string;
  settings: QuizSettings;
  theme: string;
  coverIcon: string;
  onSettings: (patch: Partial<QuizSettings>) => void;
  onTheme: (theme: string) => void;
  onIcon: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ink/20 p-3 text-left transition hover:border-grape hover:bg-white"
      >
        <Palette className="size-5 text-grape" />
        <span className="flex-1">
          <span className="block font-display font-bold">
            Give this quiz its own look
          </span>
          <span className="text-xs text-ink-soft">
            Cover art, custom icon & room palette
          </span>
        </span>
        <span className="text-sm font-bold">Style it →</span>
      </button>
      {open && (
        <Dialog title="A little more you." onClose={() => setOpen(false)}>
          <p className="mb-5 text-sm text-ink-soft">
            Set the scene before the first question. Your cover welcomes players
            into the room.
          </p>
          <h3 className="mb-2 font-display font-bold">Cover art</h3>
          <ImageUpload
            quizId={quizId}
            label="Upload cover"
            onUpload={(coverImage) => onSettings({ coverImage })}
          />
          <QuestionMedia url={settings.coverImage} />
          {settings.coverImage && (
            <button
              onClick={() => onSettings({ coverImage: null })}
              className="mt-2 text-sm underline"
            >
              Remove cover
            </button>
          )}
          <h3 className="mb-2 mt-6 font-display font-bold">Quiz icon</h3>
          <div className="mb-3 grid grid-cols-6 gap-2">
            {COVER_ICONS.map((key) => {
              const Icon = COVER_ICON_MAP[key];
              return (
                <button
                  key={key}
                  aria-label={key}
                  aria-pressed={!settings.iconImage && coverIcon === key}
                  onClick={() => {
                    onIcon(key);
                    onSettings({ iconImage: null });
                  }}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl border-2 border-ink/15 bg-paper-2",
                    !settings.iconImage &&
                      coverIcon === key &&
                      "border-grape bg-grape/10",
                  )}
                >
                  <Icon className="size-5" />
                </button>
              );
            })}
          </div>
          <ImageUpload
            quizId={quizId}
            label="Upload custom icon"
            onUpload={(iconImage) => onSettings({ iconImage })}
          />
          {settings.iconImage && (
            <>
              <div className="w-24">
                <QuestionMedia url={settings.iconImage} />
              </div>
              <button
                onClick={() => onSettings({ iconImage: null })}
                className="text-sm underline"
              >
                Use built-in icon
              </button>
            </>
          )}
          <h3 className="mb-2 mt-6 font-display font-bold">Room palette</h3>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.key}
                aria-pressed={theme === t.key}
                onClick={() => onTheme(t.key)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 p-3 text-left text-sm font-bold",
                  theme === t.key
                    ? "border-ink bg-white shadow-pop"
                    : "border-ink/15",
                )}
              >
                <span
                  className={cn(
                    "size-7 rounded-full border-2 border-ink",
                    t.swatch,
                  )}
                />
                {t.label}
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
