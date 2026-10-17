const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sessionPrefix(sessionId: string): string {
  if (!UUID.test(sessionId)) throw new Error("Invalid realtime session id");
  return `quizza:v1:session:${sessionId}`;
}

export function stateChannel(sessionId: string): string {
  return `${sessionPrefix(sessionId)}:state`;
}

export function hostChannel(sessionId: string): string {
  return `${sessionPrefix(sessionId)}:host`;
}

export function rosterChannel(sessionId: string): string {
  return `${sessionPrefix(sessionId)}:roster`;
}

export function presenceKey(sessionId: string): string {
  return `${sessionPrefix(sessionId)}:presence`;
}

export function answerCounterKey(sessionId: string, questionId: string): string {
  if (!UUID.test(questionId)) throw new Error("Invalid realtime question id");
  return `${sessionPrefix(sessionId)}:question:${questionId}:answers`;
}
