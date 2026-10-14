import { z } from "zod";
import { apiSchemas, type ApiSchemaName } from "./schemas";

/**
 * Builds the OpenAPI 3.1 document for the /api/v1 surface. Component schemas are
 * generated directly from the same zod schemas the handlers validate against
 * (via zod's native JSON Schema output, which is draft-2020-12, exactly what
 * OpenAPI 3.1 uses). The route list below is maintained alongside the handlers.
 */

type ParamDef = {
  name: string;
  in: "path" | "header" | "query";
  required?: boolean;
  description?: string;
};

type RouteDef = {
  method: "get" | "post";
  path: string;
  tags: string[];
  summary: string;
  description?: string;
  parameters?: ParamDef[];
  body?: ApiSchemaName;
  responses: Record<string, { description: string; schema?: ApiSchemaName }>;
};

const routes: RouteDef[] = [
  {
    method: "post",
    path: "/api/v1/sessions",
    tags: ["Sessions"],
    summary: "Create a session",
    description:
      "Creates a run of a quiz. For scheduled mode, provide opensAt and closesAt. The response includes a hostToken that controls the session and is returned only once.",
    body: "CreateSessionBody",
    responses: {
      "201": { description: "Session created", schema: "SessionCreated" },
      "404": { description: "Quiz not found", schema: "ApiError" },
      "422": { description: "Validation error", schema: "ApiError" },
    },
  },
  {
    method: "get",
    path: "/api/v1/sessions/{code}",
    tags: ["Sessions"],
    summary: "Get public session info",
    description: "Public details for a join screen. Never includes answers or the host token.",
    parameters: [{ name: "code", in: "path", required: true, description: "Join code" }],
    responses: {
      "200": { description: "Session info", schema: "SessionPublic" },
      "404": { description: "Session not found", schema: "ApiError" },
    },
  },
  {
    method: "post",
    path: "/api/v1/sessions/{code}/participants",
    tags: ["Participants"],
    summary: "Join a session",
    description: "Joins anonymously with a nickname. Returns a clientToken used to submit answers and reconnect.",
    parameters: [{ name: "code", in: "path", required: true, description: "Join code" }],
    body: "JoinBody",
    responses: {
      "201": { description: "Joined", schema: "Participant" },
      "404": { description: "Session not found", schema: "ApiError" },
      "409": { description: "Session is not open to join", schema: "ApiError" },
      "422": { description: "Validation error", schema: "ApiError" },
    },
  },
  {
    method: "get",
    path: "/api/v1/sessions/{code}/questions",
    tags: ["Play"],
    summary: "List questions (scheduled mode)",
    description:
      "Returns the quiz questions for a scheduled session so a player can take it self-paced. Correct answers are never included. Requires a participant client token.",
    parameters: [
      { name: "code", in: "path", required: true, description: "Join code" },
      { name: "x-client-token", in: "header", required: true, description: "Participant client token" },
    ],
    responses: {
      "200": { description: "Questions", schema: "QuestionList" },
      "401": { description: "Missing or invalid client token", schema: "ApiError" },
      "404": { description: "Session not found", schema: "ApiError" },
      "409": { description: "Session is not a scheduled session, or is not open", schema: "ApiError" },
    },
  },
  {
    method: "post",
    path: "/api/v1/sessions/{code}/answers",
    tags: ["Play"],
    summary: "Submit an answer",
    description:
      "Records one answer with its accuracy and response time. A participant may answer each question only once.",
    parameters: [{ name: "code", in: "path", required: true, description: "Join code" }],
    body: "SubmitAnswerBody",
    responses: {
      "200": { description: "Answer recorded", schema: "AnswerResult" },
      "404": { description: "Session, question, or participant not found", schema: "ApiError" },
      "409": { description: "Already answered, or session not accepting answers", schema: "ApiError" },
      "422": { description: "Validation error", schema: "ApiError" },
    },
  },
  {
    method: "get",
    path: "/api/v1/sessions/{code}/results",
    tags: ["Results"],
    summary: "Get results and leaderboard",
    description: "Leaderboard and per-question aggregates for a session.",
    parameters: [{ name: "code", in: "path", required: true, description: "Join code" }],
    responses: {
      "200": { description: "Results", schema: "Results" },
      "404": { description: "Session not found", schema: "ApiError" },
    },
  },
  {
    method: "post",
    path: "/api/v1/sessions/{code}/control",
    tags: ["Live"],
    summary: "Control a live session",
    description:
      "Host-only. Advances the live session: start, reveal, next, or end. Requires the host token as a Bearer credential.",
    parameters: [
      { name: "code", in: "path", required: true, description: "Join code" },
      { name: "authorization", in: "header", required: true, description: "Bearer <host token>" },
    ],
    body: "ControlBody",
    responses: {
      "200": { description: "Applied", schema: "Ok" },
      "401": { description: "Missing host token", schema: "ApiError" },
      "403": { description: "Invalid host token", schema: "ApiError" },
      "409": { description: "Not a live session", schema: "ApiError" },
    },
  },
  {
    method: "get",
    path: "/api/v1/sessions/{code}/stream",
    tags: ["Live"],
    summary: "Subscribe to live updates (SSE)",
    description:
      "Server-Sent Events stream of state snapshots for a live session. Pass host=<host token> or player=<client token> in the query (EventSource cannot send headers). Responses are text/event-stream, not JSON.",
    parameters: [
      { name: "code", in: "path", required: true, description: "Join code" },
      { name: "host", in: "query", required: false, description: "Host token (for the presenter)" },
      { name: "player", in: "query", required: false, description: "Client token (for a participant)" },
    ],
    responses: {
      "200": { description: "An event stream (text/event-stream)" },
      "401": { description: "Missing or invalid token" },
      "404": { description: "Session not found" },
    },
  },
];

function schemaJson(name: ApiSchemaName): Record<string, unknown> {
  const js = z.toJSONSchema(apiSchemas[name], {
    target: "draft-2020-12",
    io: "input",
  }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

function ref(name: ApiSchemaName) {
  return { $ref: `#/components/schemas/${name}` };
}

export function buildOpenApiDocument() {
  const schemas: Record<string, unknown> = {};
  for (const name of Object.keys(apiSchemas) as ApiSchemaName[]) {
    schemas[name] = schemaJson(name);
  }

  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const path = (paths[r.path] ??= {});
    path[r.method] = {
      tags: r.tags,
      summary: r.summary,
      ...(r.description ? { description: r.description } : {}),
      ...(r.parameters
        ? {
            parameters: r.parameters.map((p) => ({
              name: p.name,
              in: p.in,
              required: p.required ?? false,
              ...(p.description ? { description: p.description } : {}),
              schema: { type: "string" },
            })),
          }
        : {}),
      ...(r.body
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: ref(r.body) } },
            },
          }
        : {}),
      responses: Object.fromEntries(
        Object.entries(r.responses).map(([status, resp]) => [
          status,
          {
            description: resp.description,
            ...(resp.schema
              ? { content: { "application/json": { schema: ref(resp.schema) } } }
              : {}),
          },
        ]),
      ),
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "quizza API",
      version: "1.0.0",
      description:
        "The runtime and play API for quizza. Hosts create sessions; participants join, submit answers, and read results. Builder CRUD is internal and not part of this surface.",
    },
    servers: [{ url: "/", description: "This instance" }],
    tags: [
      { name: "Sessions", description: "Create and read runs of a quiz" },
      { name: "Participants", description: "Joining a session" },
      { name: "Play", description: "Taking a quiz and submitting answers" },
      { name: "Results", description: "Leaderboard and aggregates" },
    ],
    paths,
    components: { schemas },
  };
}
