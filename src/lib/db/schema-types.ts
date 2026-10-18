/**
 * Plain TypeScript mirrors of the DB enums + row shapes used by the builder.
 * Kept free of any drizzle/postgres imports so client components can use them
 * without pulling server-only code into the browser bundle.
 */

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "poll"
  | "word_cloud"
  | "scale"
  | "open_text";

export type SessionStatus = "lobby" | "active" | "ended";
export type SessionMode = "live" | "scheduled";

export type OptionRow = {
  id: string;
  questionId: string;
  position: number;
  label: string;
  isCorrect: boolean;
  color: string | null;
};

export type QuestionSettings = {
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  maxWords?: number;
  speedBonus?: boolean | null;
};

export type QuestionRow = {
  id: string;
  quizId: string;
  position: number;
  type: QuestionType;
  prompt: string;
  mediaUrl: string | null;
  timeLimitSec: number;
  points: number;
  settings: QuestionSettings;
};

export type RevealPolicy = "per_question" | "at_end" | "never";
export type LeaderboardPolicy = "per_question" | "at_end" | "never";
export type ParticipationMode = "anonymous" | "one_per_device" | "signed_in";
export type Powerup = "double" | "shield" | "safety_net" | "attack";

export type QuizSettings = {
  teamSelection?: boolean;
  teamNames?: string[];
  teamSize?: 1 | 2 | 3 | 4;
  coverImage?: string | null;
  iconImage?: string | null;
  speedBonus?: boolean;
  powerups?: boolean;
  powerupUses?: number; // shared charges across all enabled powerups, 1–3; default 1
  powerupTypes?: Powerup[];
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  allowLateJoin?: boolean;
  // when players learn whether they were correct and what the answer was
  revealAnswers?: RevealPolicy; // default "per_question"
  // when the scored leaderboard is shown to players
  leaderboard?: LeaderboardPolicy; // default "at_end"
  // who may join and whether replay is prevented
  participation?: ParticipationMode; // default "one_per_device"
};

export type QuizRow = {
  id: string;
  ownerId: string | null;
  title: string;
  description: string | null;
  coverIcon: string;
  theme: string;
  settings: QuizSettings;
};

/** A question with its options, as the builder consumes it. */
export type QuestionWithOptions = QuestionRow & { options: OptionRow[] };

/** The full editable quiz the builder loads. */
export type QuizWithQuestions = QuizRow & { questions: QuestionWithOptions[] };
