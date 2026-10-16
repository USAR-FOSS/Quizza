import type { QuestionType } from "@/lib/db/schema-types";

/** Human-facing metadata for each question type, used across builder and player. */
export const QUESTION_TYPES: Record<
  QuestionType,
  {
    label: string;
    blurb: string;
    hasOptions: boolean; // does it use the options table?
    scorable: boolean; // can answers be right or wrong?
  }
> = {
  multiple_choice: {
    label: "Multiple choice",
    blurb: "Players pick one option. Mark the correct one to score it.",
    hasOptions: true,
    scorable: true,
  },
  true_false: {
    label: "True or false",
    blurb: "A binary question with one correct answer.",
    hasOptions: true,
    scorable: true,
  },
  poll: {
    label: "Poll",
    blurb: "Gather opinions. No correct answer.",
    hasOptions: true,
    scorable: false,
  },
  word_cloud: {
    label: "Word cloud",
    blurb: "Short free text, aggregated into a cloud.",
    hasOptions: false,
    scorable: false,
  },
  scale: {
    label: "Scale",
    blurb: "Rate on a number scale.",
    hasOptions: false,
    scorable: false,
  },
  open_text: {
    label: "Open text",
    blurb: "Longer free-form responses.",
    hasOptions: false,
    scorable: false,
  },
};

export const QUESTION_TYPE_ORDER: QuestionType[] = [
  "multiple_choice",
  "true_false",
  "poll",
  "word_cloud",
  "scale",
  "open_text",
];

/** Candy palette keys usable as option tile colors, themes, and avatars. */
export const OPTION_COLORS = [
  "grape",
  "coral",
  "sky",
  "mint",
  "sun",
  "lime",
] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];
export const COLOR_TEXT: Record<OptionColor, string> = {
  grape: "text-white",
  coral: "text-ink",
  sky: "text-ink",
  mint: "text-ink",
  sun: "text-ink",
  lime: "text-ink",
};

/** Tailwind background classes per palette key (kept static so JIT picks them up). */
export const COLOR_BG: Record<OptionColor, string> = {
  grape: "bg-grape",
  coral: "bg-coral",
  sky: "bg-sky",
  mint: "bg-mint",
  sun: "bg-sun",
  lime: "bg-lime",
};

/** Themes a quiz can wear (drives the player and host accent). */
export const THEMES = [
  { key: "grape", label: "After-school club", swatch: "bg-grape" },
  { key: "coral", label: "Pink lemonade", swatch: "bg-coral" },
  { key: "mint", label: "Field notes", swatch: "bg-mint" },
  { key: "sky", label: "Blue-sky thinking", swatch: "bg-sky" },
  { key: "sun", label: "Golden hour", swatch: "bg-sun" },
  { key: "lime", label: "Fresh squeeze", swatch: "bg-lime" },
] as const;

/**
 * Cover icon keys for quizzes. Each maps to a lucide icon in
 * src/components/ui/quiz-icons.tsx. No emoji by product rule.
 */
export const COVER_ICONS = [
  "shapes",
  "zap",
  "target",
  "rocket",
  "flame",
  "lightbulb",
  "trophy",
  "brain",
  "puzzle",
  "star",
  "flask",
  "gamepad",
  "globe",
  "music",
  "book",
  "code",
  "food",
  "leaf",
] as const;
export type CoverIcon = (typeof COVER_ICONS)[number];

export const DEFAULTS = {
  timeLimitSec: 20,
  points: 100,
  optionsPerQuestion: 4,
  maxOptions: 8,
  scaleMin: 1,
  scaleMax: 5,
};
