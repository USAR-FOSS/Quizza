"use client";

import { motion, AnimatePresence } from "motion/react";
import { Plus, Check, Trash2, Clock, Trophy, Minus } from "lucide-react";
import {
  COLOR_BG,
  DEFAULTS,
  OPTION_COLORS,
  QUESTION_TYPES,
  type OptionColor,
} from "@/lib/quiz-constants";
import { QUESTION_TYPE_ICON } from "@/components/ui/quiz-icons";
import type { OptionRow, QuestionWithOptions } from "@/lib/db/schema-types";
import { cn } from "@/lib/utils";
import { QuestionMedia } from "@/components/ui/question-media";
import { isMediaUrl } from "@/lib/media";
import { useState } from "react";
import { ImageUpload } from "@/components/ui/image-upload";

type Props = {
  question: QuestionWithOptions;
  index: number;
  speedBonus?: boolean;
  onChange: (patch: Partial<QuestionWithOptions>) => void;
  onAddOption: () => void;
  onUpdateOption: (optionId: string, patch: Partial<OptionRow>) => void;
  onSetCorrect: (optionId: string) => void;
  onDeleteOption: (optionId: string) => void;
};

export function QuestionEditor({
  question,
  index,
  speedBonus = false,
  onChange,
  onAddOption,
  onUpdateOption,
  onSetCorrect,
  onDeleteOption,
}: Props) {
  const meta = QUESTION_TYPES[question.type];
  const TypeIcon = QUESTION_TYPE_ICON[question.type];
  const [mediaDraft, setMediaDraft] = useState(question.mediaUrl ?? "");
  const validMedia = !mediaDraft || isMediaUrl(mediaDraft);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl border-2 border-ink bg-paper p-5 shadow-pop sm:p-7"
    >
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-paper-2 px-3 py-1 font-display text-xs font-bold text-ink">
          <TypeIcon className="size-3.5" />
          {meta.label}
        </span>
        <span className="font-display text-sm font-bold text-ink-soft">
          Question {index + 1}
        </span>
      </div>

      {/* prompt */}
      <textarea
        value={question.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        rows={2}
        maxLength={300}
        placeholder="Type your question…"
        className="mt-4 w-full resize-none rounded-2xl border-2 border-ink bg-paper-2 p-4 font-display text-2xl font-extrabold leading-tight tracking-tight text-ink placeholder:text-ink-soft/40 focus:bg-white focus:outline-none"
      />

      <details
        className="mt-4 rounded-2xl border border-ink/15 bg-paper-2/60 p-4"
        open={Boolean(question.mediaUrl) || undefined}
      >
        <summary className="cursor-pointer font-display text-sm font-bold">
          Add a picture, video, or audio clip
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ImageUpload
            quizId={question.quizId}
            onUpload={(url) => {
              setMediaDraft(url);
              onChange({ mediaUrl: url });
            }}
          />
          {question.mediaUrl && (
            <button
              type="button"
              onClick={() => {
                setMediaDraft("");
                onChange({ mediaUrl: null });
              }}
              className="text-sm font-semibold underline underline-offset-4"
            >
              Remove media
            </button>
          )}
        </div>
        <label
          className="mt-3 block text-xs font-semibold text-ink-soft"
          htmlFor="question-media"
        >
          Or paste a direct HTTPS link
        </label>
        <input
          id="question-media"
          type="text"
          value={mediaDraft}
          aria-invalid={!validMedia}
          placeholder="https://example.com/illustration.webp"
          maxLength={2048}
          onChange={(event) => {
            const value = event.target.value;
            setMediaDraft(value);
            if (!value || isMediaUrl(value))
              onChange({ mediaUrl: value || null });
          }}
          className="mt-1 w-full rounded-xl border-2 border-ink/20 bg-paper px-3 py-2 text-sm"
        />
        {!validMedia && (
          <p className="mt-1 text-sm text-grape-dark">
            Enter a complete HTTPS URL to save it.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-soft">
          Images, MP4/WebM video, and MP3/OGG audio. Use a direct file link.
        </p>
        <QuestionMedia url={question.mediaUrl} />
      </details>

      {/* settings row */}
      <div className="mt-4 flex flex-wrap gap-3">
        <Stepper
          icon={<Clock className="size-4" />}
          label="Time"
          suffix="s"
          value={question.timeLimitSec}
          min={5}
          max={300}
          step={5}
          onChange={(v) => onChange({ timeLimitSec: v })}
        />
        {meta.scorable && (
          <Stepper
            icon={<Trophy className="size-4" />}
            label="Points"
            value={question.points}
            min={0}
            max={5000}
            step={100}
            onChange={(v) => onChange({ points: v })}
          />
        )}
        {meta.scorable && (
          <label className="flex items-center gap-2 rounded-2xl border-2 border-ink/20 px-3 py-2 text-sm font-semibold">
            Speed scoring
            <select
              value={
                question.settings.speedBonus == null
                  ? "quiz"
                  : String(question.settings.speedBonus)
              }
              onChange={(event) =>
                onChange({
                  settings: {
                    ...question.settings,
                    speedBonus:
                      event.target.value === "quiz"
                        ? null
                        : event.target.value === "true",
                  },
                })
              }
              className="min-w-0 rounded-lg bg-paper-2 px-2 py-1 text-sm"
            >
              <option value="quiz">
                Quiz default ({speedBonus ? "on" : "off"})
              </option>
              <option value="true">On for this question</option>
              <option value="false">Off for this question</option>
            </select>
          </label>
        )}
      </div>

      {/* body by type */}
      <div className="mt-6">
        {meta.hasOptions ? (
          <OptionsEditor
            question={question}
            onAddOption={onAddOption}
            onUpdateOption={onUpdateOption}
            onSetCorrect={onSetCorrect}
            onDeleteOption={onDeleteOption}
          />
        ) : question.type === "scale" ? (
          <ScaleEditor question={question} onChange={onChange} />
        ) : question.type === "word_cloud" ? (
          <WordCloudEditor question={question} onChange={onChange} />
        ) : (
          <p className="rounded-2xl border-2 border-dashed border-ink/20 p-5 text-center text-ink-soft">
            Players type a free-form response. Nothing else to configure.
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 *  options
 * ------------------------------------------------------------------ */

function OptionsEditor({
  question,
  onAddOption,
  onUpdateOption,
  onSetCorrect,
  onDeleteOption,
}: {
  question: QuestionWithOptions;
  onAddOption: () => void;
  onUpdateOption: (optionId: string, patch: Partial<OptionRow>) => void;
  onSetCorrect: (optionId: string) => void;
  onDeleteOption: (optionId: string) => void;
}) {
  const meta = QUESTION_TYPES[question.type];
  const fixed = question.type === "true_false"; // can't add/remove T/F
  const canAdd = !fixed && question.options.length < DEFAULTS.maxOptions;

  return (
    <div className="flex flex-col gap-2.5">
      {meta.scorable && (
        <p className="text-sm text-ink-soft">
          Tap the circle to mark the correct answer.
        </p>
      )}

      <AnimatePresence initial={false}>
        {question.options.map((opt) => (
          <motion.div
            key={opt.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "flex items-center gap-2.5 rounded-2xl border-2 p-2.5",
              opt.isCorrect && meta.scorable
                ? "border-mint bg-mint/10"
                : "border-ink bg-paper-2",
            )}
          >
            {/* color swatch -> cycles palette */}
            <button
              type="button"
              onClick={() => {
                const i = OPTION_COLORS.indexOf(opt.color as OptionColor);
                const next = OPTION_COLORS[(i + 1) % OPTION_COLORS.length];
                onUpdateOption(opt.id, { color: next });
              }}
              aria-label="Change colour"
              className={cn(
                "size-9 shrink-0 rounded-xl border-2 border-ink transition-transform hover:scale-110",
                COLOR_BG[(opt.color as OptionColor) ?? "grape"] ?? "bg-grape",
              )}
            />

            <input
              value={opt.label}
              onChange={(e) =>
                onUpdateOption(opt.id, { label: e.target.value })
              }
              placeholder="Answer option…"
              maxLength={120}
              className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1.5 font-semibold text-ink placeholder:text-ink-soft/50 focus:bg-white focus:outline-none"
            />

            {meta.scorable && (
              <button
                type="button"
                onClick={() => onSetCorrect(opt.id)}
                aria-label="Mark correct"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  opt.isCorrect
                    ? "border-mint bg-mint text-white"
                    : "border-ink/30 text-transparent hover:border-ink",
                )}
              >
                <Check className="size-4" strokeWidth={3} />
              </button>
            )}

            {!fixed && question.options.length > 2 && (
              <button
                type="button"
                onClick={() => onDeleteOption(opt.id)}
                aria-label="Delete option"
                className="shrink-0 rounded-lg p-1.5 text-ink-soft/50 transition-colors hover:bg-coral/15 hover:text-coral"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {canAdd && (
        <button
          type="button"
          onClick={onAddOption}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/30 py-2.5 font-display text-sm font-bold text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          <Plus className="size-4" />
          Add option
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  scale
 * ------------------------------------------------------------------ */

function ScaleEditor({
  question,
  onChange,
}: {
  question: QuestionWithOptions;
  onChange: (patch: Partial<QuestionWithOptions>) => void;
}) {
  const s = question.settings ?? {};
  const min = s.scaleMin ?? DEFAULTS.scaleMin;
  const max = s.scaleMax ?? DEFAULTS.scaleMax;

  function patchSettings(p: Partial<typeof s>) {
    onChange({ settings: { ...s, ...p } });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Stepper
          label="From"
          value={min}
          min={0}
          max={max - 1}
          step={1}
          onChange={(v) => patchSettings({ scaleMin: v })}
        />
        <Stepper
          label="To"
          value={max}
          min={min + 1}
          max={10}
          step={1}
          onChange={(v) => patchSettings({ scaleMax: v })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={s.scaleMinLabel ?? ""}
          onChange={(e) => patchSettings({ scaleMinLabel: e.target.value })}
          placeholder="Low label (e.g. Nope)"
          maxLength={40}
          className="rounded-xl border-2 border-ink bg-paper-2 px-3 py-2 text-sm font-semibold text-ink focus:bg-white focus:outline-none"
        />
        <input
          value={s.scaleMaxLabel ?? ""}
          onChange={(e) => patchSettings({ scaleMaxLabel: e.target.value })}
          placeholder="High label (e.g. Love it)"
          maxLength={40}
          className="rounded-xl border-2 border-ink bg-paper-2 px-3 py-2 text-sm font-semibold text-ink focus:bg-white focus:outline-none"
        />
      </div>
      {/* preview */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-ink/20 p-4">
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <span
            key={n}
            className="flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-paper-2 font-display font-bold text-ink"
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  word cloud
 * ------------------------------------------------------------------ */

function WordCloudEditor({
  question,
  onChange,
}: {
  question: QuestionWithOptions;
  onChange: (patch: Partial<QuestionWithOptions>) => void;
}) {
  const s = question.settings ?? {};
  const maxWords = s.maxWords ?? 1;
  return (
    <div className="flex flex-col gap-3">
      <Stepper
        label="Entries per player"
        value={maxWords}
        min={1}
        max={10}
        step={1}
        onChange={(v) => onChange({ settings: { ...s, maxWords: v } })}
      />
      <p className="rounded-2xl border-2 border-dashed border-ink/20 p-4 text-center text-ink-soft">
        Players submit short words. Popular ones grow larger in the live cloud.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  shared stepper
 * ------------------------------------------------------------------ */

function Stepper({
  icon,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex items-center gap-2 rounded-2xl border-2 border-ink bg-paper-2 px-3 py-1.5">
      {icon && <span className="text-ink-soft">{icon}</span>}
      <span className="font-display text-sm font-bold text-ink-soft">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          className="flex size-6 items-center justify-center rounded-lg bg-paper text-ink transition-colors hover:bg-white disabled:opacity-30"
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-3.5" strokeWidth={3} />
        </button>
        <span className="min-w-[3ch] text-center font-display font-extrabold text-ink tabular-nums">
          {value}
          {suffix}
        </span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          className="flex size-6 items-center justify-center rounded-lg bg-paper text-ink transition-colors hover:bg-white disabled:opacity-30"
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
