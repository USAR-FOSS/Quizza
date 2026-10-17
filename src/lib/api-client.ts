/**
 * Thin browser client for the /api/v1 surface. Used by the player and host UIs.
 * Shapes mirror the server zod schemas in src/lib/api/schemas.ts.
 */

import type { Powerup } from "@/lib/powerups";

export type SessionMode = "live" | "scheduled";
export type SessionStatus = "lobby" | "active" | "ended";
export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "poll"
  | "word_cloud"
  | "scale"
  | "open_text";

export type ParticipationMode = "anonymous" | "one_per_device" | "signed_in";

export type SessionPublic = {
  id: string;
  code: string;
  mode: SessionMode;
  status: SessionStatus;
  opensAt: string | null;
  closesAt: string | null;
  participantCount: number;
  participation: ParticipationMode;
  powerups: boolean;
  powerupUses: number;
  powerupTypes: Powerup[];
  quiz: {
    title: string;
    coverIcon: string;
    theme: string;
    coverImage?: string | null;
    iconImage?: string | null;
  };
};

export type SessionCreated = {
  id: string;
  code: string;
  mode: SessionMode;
  status: SessionStatus;
  opensAt: string | null;
  closesAt: string | null;
  hostToken: string;
};

export type ParticipantCreated = {
  id: string;
  nickname: string;
  avatarColor: string;
  avatarUrl?: string | null;
  clientToken: string;
};

export type OptionPublic = {
  id: string;
  position: number;
  label: string;
  color: string | null;
};

export type QuestionPublic = {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  mediaUrl: string | null;
  timeLimitSec: number;
  points: number;
  settings: Record<string, unknown>;
  options: OptionPublic[];
};

export type AnswerResult = {
  accepted: true;
  revealed: boolean;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  correctOptionId: string | null;
  attackStolen?: number;
  attackBlocked?: boolean;
  attackedLoss?: number;
};

export type LeaderboardEntry = {
  participantId: string;
  nickname: string;
  avatarColor: string;
  avatarUrl?: string | null;
  score: number;
  rank: number;
};

export type QuestionStats = {
  questionId: string;
  prompt: string;
  type: QuestionType;
  responses: number;
  options: {
    optionId: string;
    label: string;
    count: number;
    isCorrect: boolean;
  }[];
  textValues: string[];
  numberAverage: number | null;
};

export type Results = {
  totalParticipants: number;
  over: boolean;
  showAnswers: boolean;
  showBoard: boolean;
  leaderboard: LeaderboardEntry[];
  questionStats: QuestionStats[];
};

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const BASE = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiClientError(
      res.status,
      "invalid_response",
      "The server could not complete the request. Please try again.",
    );
  }
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiClientError(
      res.status,
      err.code ?? "error",
      err.message ?? "Request failed",
      err.details,
    );
  }
  return data as T;
}

export const api = {
  createSession: (body: {
    quizId: string;
    mode: SessionMode;
    opensAt?: string;
    closesAt?: string;
  }) =>
    request<SessionCreated>("/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getSession: (code: string) => request<SessionPublic>(`/sessions/${code}`),
  searchTargets: (code: string, clientToken: string, search: string) =>
    request<Array<{ id: string; nickname: string; avatarColor: string; avatarUrl: string | null }>>(
      `/sessions/${code}/participants?search=${encodeURIComponent(search)}`,
      { headers: { "x-client-token": clientToken } },
    ),
  getProgress: (code: string, clientToken: string) =>
    request<{
      answered: string[];
      usedPowerups: Powerup[];
      results: Record<string, AnswerResult>;
    }>(`/sessions/${code}/participants/me`, {
      headers: { "x-client-token": clientToken },
    }),

  join: (code: string, body: { nickname: string; avatarColor?: string }) =>
    request<ParticipantCreated>(`/sessions/${code}/participants`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getQuestions: (code: string, clientToken: string) =>
    request<{
      answered: string[];
      questions: QuestionPublic[];
      usedPowerups: Powerup[];
    }>(`/sessions/${code}/questions`, {
      headers: { "x-client-token": clientToken },
    }),

  getViewToken: (code: string, questionId: string, clientToken: string) =>
    request<{ viewToken: string; startedAt: string }>(
      `/sessions/${code}/questions/${questionId}/view`,
      { headers: { "x-client-token": clientToken } },
    ),

  submitAnswer: (
    code: string,
    body: {
      questionId: string;
      clientToken: string;
      optionId?: string;
      textValue?: string;
      numberValue?: number;
      elapsedMs?: number;
      viewToken?: string;
      powerup?: Powerup;
      powerupTargetId?: string;
    },
  ) =>
    request<AnswerResult>(`/sessions/${code}/answers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getResults: (code: string, hostToken?: string) =>
    request<Results>(`/sessions/${code}/results`, {
      headers: hostToken ? { authorization: `Bearer ${hostToken}` } : {},
    }),

  control: (
    code: string,
    hostToken: string,
    action: "start" | "reveal" | "next" | "end",
  ) =>
    request<{ ok: true }>(`/sessions/${code}/control`, {
      method: "POST",
      headers: { authorization: `Bearer ${hostToken}` },
      body: JSON.stringify({ action }),
    }),

  /** URL for an EventSource connection. Host or player auth goes in the query,
   * since EventSource cannot send headers. */
  streamUrl: (code: string, auth: { host?: string; player?: string }) => {
    const q = auth.host
      ? `host=${encodeURIComponent(auth.host)}`
      : `player=${encodeURIComponent(auth.player ?? "")}`;
    return `${BASE}/sessions/${code}/stream?${q}`;
  },
};
