import {
  Shapes,
  Zap,
  Target,
  Rocket,
  Flame,
  Lightbulb,
  Trophy,
  Brain,
  Puzzle,
  Star,
  FlaskConical,
  Gamepad2,
  ListChecks,
  ToggleLeft,
  BarChart3,
  Cloud,
  SlidersHorizontal,
  PenLine,
  HelpCircle,
  Globe,
  Music,
  BookOpen,
  Code,
  ChefHat,
  Leaf,
  type LucideIcon,
} from "lucide-react";
import type { QuestionType } from "@/lib/db/schema-types";

/** Lucide icon per question type (replaces the old per-type emoji). */
export const QUESTION_TYPE_ICON: Record<QuestionType, LucideIcon> = {
  multiple_choice: ListChecks,
  true_false: ToggleLeft,
  poll: BarChart3,
  word_cloud: Cloud,
  scale: SlidersHorizontal,
  open_text: PenLine,
};

/** Lucide icon per quiz cover key. */
export const COVER_ICON_MAP: Record<string, LucideIcon> = {
  shapes: Shapes,
  zap: Zap,
  target: Target,
  rocket: Rocket,
  flame: Flame,
  lightbulb: Lightbulb,
  trophy: Trophy,
  brain: Brain,
  puzzle: Puzzle,
  star: Star,
  flask: FlaskConical,
  gamepad: Gamepad2,
  globe: Globe,
  music: Music,
  book: BookOpen,
  code: Code,
  food: ChefHat,
  leaf: Leaf,
};

export function coverIcon(key: string): LucideIcon {
  return COVER_ICON_MAP[key] ?? HelpCircle;
}
