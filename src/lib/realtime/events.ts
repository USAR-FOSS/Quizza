/**
 * Client-safe realtime types. No server imports, so player and host UIs can use
 * these directly. The SSE stream sends a role-appropriate snapshot on every
 * phase change, plus a light answered-count tick to the host during a question.
 */

export type LivePhase = "lobby" | "question" | "reveal" | "ended";

export interface LiveOption {
  id: string;
  label: string;
  color: string | null;
}

export interface LiveQuestion {
  id: string;
  type: string;
  prompt: string;
  timeLimitSec: number;
  startedAt: string | null;
  index: number; // 0-based position in the quiz
  total: number;
  options: LiveOption[];
}

export interface LiveLeaderboardEntry {
  participantId: string;
  nickname: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export interface RevealTally {
  optionId: string;
  count: number;
}

export interface PlayerSnapshot {
  phase: LivePhase;
  quiz: { title: string; theme: string };
  participantCount: number;
  question: LiveQuestion | null;
  reveal: {
    correctOptionId: string | null;
    tallies: RevealTally[];
    totalAnswers: number;
  } | null;
  leaderboard: LiveLeaderboardEntry[];
}

export interface HostSnapshot extends PlayerSnapshot {
  answeredCount: number;
  correctOptionId: string | null; // the host always knows the answer
}

export type LiveEvent =
  | { kind: "state"; player: PlayerSnapshot; host: HostSnapshot }
  | { kind: "tick"; answeredCount: number };
