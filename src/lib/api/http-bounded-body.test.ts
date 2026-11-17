import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseBody, readBoundedJson } from "./http";

function createStreamRequest(
  chunks: string[],
  headers: Record<string, string> = {},
): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Request("https://example.com/api/test", {
    method: "POST",
    headers: new Headers(headers),
    body: stream,
    // @ts-expect-error duplex needed for node fetch with stream body
    duplex: "half",
  });
}

describe("Bounded JSON Request Parsing (Issue #40)", () => {
  const schema = z.object({
    title: z.string(),
    count: z.number().optional(),
  });

  it("parses valid JSON within byte limits", async () => {
    const payload = JSON.stringify({ title: "My Quiz", count: 42 });
    const req = createStreamRequest([payload]);

    const result = await parseBody(req, schema, 1024);
    expect(result).toEqual({ title: "My Quiz", count: 42 });
  });

  it("rejects immediately with 413 when Content-Length exceeds limit", async () => {
    const payload = JSON.stringify({ title: "Exceeds length header" });
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        "content-length": "5000",
        "content-type": "application/json",
      },
      body: payload,
    });

    await expect(readBoundedJson(req, 100)).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });

  it("enforces streamed byte limits and throws 413 when Content-Length is absent", async () => {
    // Generate chunks that collectively exceed 200 bytes without Content-Length
    const chunkA = JSON.stringify({ title: "a".repeat(120) });
    const chunkB = JSON.stringify({ extra: "b".repeat(120) });

    const req = createStreamRequest([chunkA, chunkB]); // ~270 bytes

    await expect(readBoundedJson(req, 150)).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });

  it("handles valid chunked streamed payloads correctly", async () => {
    const chunk1 = '{"title": "Chunked ';
    const chunk2 = 'Quiz", "count": 10}';

    const req = createStreamRequest([chunk1, chunk2]);

    const result = await parseBody(req, schema, 1024);
    expect(result).toEqual({ title: "Chunked Quiz", count: 10 });
  });

  it("throws 400 invalid_json on malformed JSON payload", async () => {
    const req = createStreamRequest(['{"title": "incomplete']);

    await expect(readBoundedJson(req, 1024)).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
  });

  it("throws 400 invalid_json on empty body", async () => {
    const req = createStreamRequest([]);

    await expect(readBoundedJson(req, 1024)).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
  });

  it("throws 422 validation_error when body parses as JSON but fails Zod schema", async () => {
    const req = createStreamRequest([JSON.stringify({ wrongField: 123 })]);

    await expect(parseBody(req, schema, 1024)).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
    });
  });

  it("handles non-stream fallback Request bodies gracefully", async () => {
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      body: JSON.stringify({ title: "Fallback non-stream" }),
    });

    const result = await parseBody(req, schema, 1024);
    expect(result.title).toBe("Fallback non-stream");
  });
});
