import type {
  LeaderboardPolicy,
  ParticipationMode,
  QuizSettings,
  RevealPolicy,
} from "@/lib/db/schema-types";

/**
 * Pure helpers for quiz visibility and participation policy. No server imports,
 * so both the runtime enforcement and the builder UI use the same rules.
 */

export const DEFAULT_REVEAL: RevealPolicy = "per_question";
export const DEFAULT_LEADERBOARD: LeaderboardPolicy = "at_end";
export const DEFAULT_PARTICIPATION: ParticipationMode = "anonymous";

export function revealPolicy(s: QuizSettings | null | undefined): RevealPolicy {
  return s?.revealAnswers ?? DEFAULT_REVEAL;
}

export function leaderboardPolicy(
  s: QuizSettings | null | undefined,
): LeaderboardPolicy {
  return s?.leaderboard ?? DEFAULT_LEADERBOARD;
}

export function participationMode(
  s: QuizSettings | null | undefined,
): ParticipationMode {
  return s?.participation ?? DEFAULT_PARTICIPATION;
}

/** Whether players may see which answer was correct, given the session state. */
export function canRevealAnswers(
  s: QuizSettings | null | undefined,
  over: boolean,
): boolean {
  const p = revealPolicy(s);
  if (p === "per_question") return true;
  if (p === "at_end") return over;
  return false; // never
}

/** Whether the scored leaderboard may be shown to players. */
export function canShowLeaderboard(
  s: QuizSettings | null | undefined,
  over: boolean,
): boolean {
  const p = leaderboardPolicy(s);
  if (p === "per_question") return true;
  if (p === "at_end") return over;
  return false; // never
}

/** Option metadata for the builder settings UI. */
export const REVEAL_OPTIONS: {
  value: RevealPolicy;
  label: string;
  blurb: string;
}[] = [
  {
    value: "per_question",
    label: "After each question",
    blurb:
      "Live: reveal together when time ends. Scheduled: feedback after submitting.",
  },
  {
    value: "at_end",
    label: "At the end",
    blurb: "Live: after the host ends the game. Scheduled: after each player finishes.",
  },
  {
    value: "never",
    label: "Never",
    blurb: "Players never see the correct answers. Only the host does.",
  },
];

export const LEADERBOARD_OPTIONS: {
  value: LeaderboardPolicy;
  label: string;
  blurb: string;
}[] = [
  {
    value: "per_question",
    label: "After each live round",
    blurb: "Live players see standings at each shared reveal. Scheduled players see them after finishing.",
  },
  {
    value: "at_end",
    label: "At the end",
    blurb: "Live: when the host ends. Scheduled: after each player finishes.",
  },
  {
    value: "never",
    label: "Hidden",
    blurb: "Players never see the leaderboard.",
  },
];

export const PARTICIPATION_OPTIONS: {
  value: ParticipationMode;
  label: string;
  blurb: string;
}[] = [
  {
    value: "anonymous",
    label: "Anyone, anonymous",
    blurb: "Join with just a nickname. Players can rejoin and retry.",
  },
  {
    value: "one_per_device",
    label: "One try per device",
    blurb: "Best-effort replay block using a device cookie.",
  },
  {
    value: "signed_in",
    label: "Signed in, one try",
    blurb: "Requires an account to join. One attempt per person.",
  },
];
