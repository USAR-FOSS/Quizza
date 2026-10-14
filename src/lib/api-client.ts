/**
 * Thin browser client for the /api/v1 surface. Used by the player and host UIs.
 * Shapes mirror the server zod schemas in src/lib/api/schemas.ts.
 */

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
  quiz: { title: string; coverIcon: string; theme: string };
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
};

export type LeaderboardEntry = {
  participantId: string;
  nickname: string;
  avatarColor: string;
  score: number;
  rank: number;
};

export type QuestionStats = {
  questionId: string;
  prompt: string;
  type: QuestionType;
  responses: number;
  options: { optionId: string; label: string; count: number; isCorrect: boolean }[];
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
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiClientError(res.status, err.code ?? "error", err.message ?? "Request failed");
  }
  return data as T;
}

export const api = {
  createSession: (body: {
    quizId: string;
    mode: SessionMode;
    opensAt?: string;
    closesAt?: string;
  }) => request<SessionCreated>("/sessions", { method: "POST", body: JSON.stringify(body) }),

  getSession: (code: string) => request<SessionPublic>(`/sessions/${code}`),

  join: (code: string, body: { nickname: string; avatarColor?: string }) =>
    request<ParticipantCreated>(`/sessions/${code}/participants`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getQuestions: (code: string, clientToken: string) =>
    request<{ answered: string[]; questions: QuestionPublic[] }>(
      `/sessions/${code}/questions`,
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
    },
  ) =>
    request<AnswerResult>(`/sessions/${code}/answers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getResults: (code: string) => request<Results>(`/sessions/${code}/results`),
};
