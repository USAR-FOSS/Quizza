import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ------------------------------------------------------------------ *
 *  enums
 * ------------------------------------------------------------------ */

/** The kinds of interactive slides a quiz can hold (Mentimeter-style). */
export const questionType = pgEnum("question_type", [
  "multiple_choice", // pick one (can be scored)
  "true_false", // scored binary
  "poll", // pick one, unscored opinion
  "word_cloud", // free text, aggregated into a cloud
  "scale", // 1..N rating
  "open_text", // free text responses
]);

/** Lifecycle of a run of a quiz. */
export const sessionStatus = pgEnum("session_status", [
  "lobby", // participants joining, not started
  "active", // live: a question is live. scheduled: inside the open window
  "ended",
]);

/** How a session is run. */
export const sessionMode = pgEnum("session_mode", [
  "live", // host-driven, everyone synced to the same question
  "scheduled", // open for a window, players take it self-paced
]);

/* ------------------------------------------------------------------ *
 *  users (for later OIDC via fossclub.tech - optional today)
 * ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // OIDC subject identifier; null for email/password accounts.
    subject: text("subject"),
    email: text("email"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    // scrypt hash for email/password accounts; null for OIDC accounts.
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("host"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("users_subject_key").on(t.subject),
    uniqueIndex("users_email_key").on(t.email),
  ],
);

/* ------------------------------------------------------------------ *
 *  quizzes - the reusable template
 * ------------------------------------------------------------------ */

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // nullable: anonymous creators are allowed (auth is additive later).
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    // lucide icon key shown on the quiz cover (no emoji by product rule).
    coverIcon: text("cover_icon").default("shapes").notNull(),
    // visual theme key the player/host render against.
    theme: text("theme").default("grape").notNull(),
    // free-form settings bag (shuffle, show leaderboard, music, etc.)
    settings: jsonb("settings").$type<QuizSettings>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("quizzes_owner_idx").on(t.ownerId)],
);

export type QuizSettings = {
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showLeaderboard?: boolean;
  allowLateJoin?: boolean;
};

/* ------------------------------------------------------------------ *
 *  questions - ordered slides within a quiz
 * ------------------------------------------------------------------ */

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .references(() => quizzes.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").notNull().default(0),
    type: questionType("type").notNull().default("multiple_choice"),
    prompt: text("prompt").notNull(),
    mediaUrl: text("media_url"),
    timeLimitSec: integer("time_limit_sec").default(20).notNull(),
    points: integer("points").default(1000).notNull(),
    settings: jsonb("settings").$type<QuestionSettings>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("questions_quiz_idx").on(t.quizId, t.position)],
);

export type QuestionSettings = {
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  maxWords?: number; // word cloud
  speedBonus?: boolean; // award faster answers more points
};

/* ------------------------------------------------------------------ *
 *  options - answer choices for choice-type questions
 * ------------------------------------------------------------------ */

export const options = pgTable(
  "options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .references(() => questions.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    isCorrect: boolean("is_correct").default(false).notNull(),
    // one of the candy palette keys for the option tile.
    color: text("color"),
  },
  (t) => [index("options_question_idx").on(t.questionId, t.position)],
);

/* ------------------------------------------------------------------ *
 *  sessions - a single live run of a quiz
 * ------------------------------------------------------------------ */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .references(() => quizzes.id, { onDelete: "cascade" })
      .notNull(),
    // short human-typable join code (e.g. "428 193").
    code: text("code").notNull(),
    mode: sessionMode("mode").notNull().default("live"),
    status: sessionStatus("status").notNull().default("lobby"),
    // live mode: whether the current question's results are revealed.
    revealed: boolean("revealed").notNull().default(false),
    // secret the host holds to control the session.
    hostToken: text("host_token").notNull(),
    currentQuestionId: uuid("current_question_id").references(() => questions.id, {
      onDelete: "set null",
    }),
    // live mode: when the current question went live (for speed scoring).
    questionStartedAt: timestamp("question_started_at", { withTimezone: true }),
    // scheduled mode: the window during which the quiz is open.
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    // only one active (non-ended) session may hold a given code at a time.
    uniqueIndex("sessions_code_active_key")
      .on(t.code)
      .where(sql`${t.status} <> 'ended'`),
    index("sessions_quiz_idx").on(t.quizId),
  ],
);

/* ------------------------------------------------------------------ *
 *  participants - people in a session (anonymous by default)
 * ------------------------------------------------------------------ */

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => sessions.id, { onDelete: "cascade" })
      .notNull(),
    nickname: text("nickname").notNull(),
    // palette key for the colored monogram avatar (derived from nickname).
    avatarColor: text("avatar_color").default("grape").notNull(),
    score: integer("score").default(0).notNull(),
    // client-held token so a participant can reconnect without re-joining.
    clientToken: text("client_token").notNull(),
    // signed-in participation: ties one attempt to one account.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // one-per-device participation: ties one attempt to a device cookie.
    deviceId: text("device_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("participants_session_idx").on(t.sessionId),
    uniqueIndex("participants_session_client_key").on(t.sessionId, t.clientToken),
    // one attempt per account / per device, when those modes are enabled.
    uniqueIndex("participants_session_user_key")
      .on(t.sessionId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex("participants_session_device_key")
      .on(t.sessionId, t.deviceId)
      .where(sql`${t.deviceId} is not null`),
  ],
);

/* ------------------------------------------------------------------ *
 *  answers - one response per participant per question
 * ------------------------------------------------------------------ */

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => sessions.id, { onDelete: "cascade" })
      .notNull(),
    questionId: uuid("question_id")
      .references(() => questions.id, { onDelete: "cascade" })
      .notNull(),
    participantId: uuid("participant_id")
      .references(() => participants.id, { onDelete: "cascade" })
      .notNull(),
    optionId: uuid("option_id").references(() => options.id, { onDelete: "set null" }),
    textValue: text("text_value"), // word_cloud / open_text
    numberValue: integer("number_value"), // scale
    isCorrect: boolean("is_correct").default(false).notNull(),
    responseMs: integer("response_ms"), // time taken, for speed bonus
    points: integer("points").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("answers_question_idx").on(t.questionId),
    index("answers_session_idx").on(t.sessionId),
    // a participant answers each question at most once.
    uniqueIndex("answers_unique_response").on(t.questionId, t.participantId),
  ],
);

/* ------------------------------------------------------------------ *
 *  relations (for drizzle's relational query API)
 * ------------------------------------------------------------------ */

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  owner: one(users, { fields: [quizzes.ownerId], references: [users.id] }),
  questions: many(questions),
  sessions: many(sessions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [questions.quizId], references: [quizzes.id] }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, { fields: [options.questionId], references: [questions.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [sessions.quizId], references: [quizzes.id] }),
  participants: many(participants),
  answers: many(answers),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  session: one(sessions, { fields: [participants.sessionId], references: [sessions.id] }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  session: one(sessions, { fields: [answers.sessionId], references: [sessions.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
  participant: one(participants, {
    fields: [answers.participantId],
    references: [participants.id],
  }),
  option: one(options, { fields: [answers.optionId], references: [options.id] }),
}));
