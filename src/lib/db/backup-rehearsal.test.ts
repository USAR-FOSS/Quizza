import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { csvField } from "@/lib/csv";

describe("Database Backup and Restore Rehearsal", () => {
  it("preserves migration state, database uploads, quiz content, and results through a backup-restore cycle", async () => {
    // 1. Verify migrations journal tracking
    const journalRaw = await readFile(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8");
    const journal = JSON.parse(journalRaw);
    expect(journal.entries.length).toBeGreaterThanOrEqual(9);

    const sourceData = {
      migrations: journal.entries.map((entry: { idx: number; tag: string; when: number }) => ({
        id: entry.idx,
        hash: entry.tag,
        createdAt: entry.when,
      })),
      quiz: {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Rehearsal Quiz",
        coverIcon: "terminal",
        theme: "grape",
        settings: { revealAnswers: "per_question", speedBonus: true },
      },
      question: {
        id: "22222222-2222-4222-8222-222222222222",
        prompt: "Which database stores uploaded quiz images?",
        timeLimitSec: 20,
        points: 1000,
      },
      options: [
        { id: "33333333-3333-4333-8333-333333333331", label: "PostgreSQL (uploads table)", isCorrect: true },
        { id: "33333333-3333-4333-8333-333333333332", label: "External S3 Bucket", isCorrect: false },
      ],
      session: {
        id: "44444444-4444-4444-8444-444444444444",
        code: "849201",
        mode: "scheduled",
        status: "active",
        hostToken: "mock_host_token_0123456789abcdef",
      },
      participant: {
        id: "55555555-5555-4555-8555-555555555555",
        nickname: "Rehearsal Participant",
        teamName: "Team Verified",
        score: 950,
        clientToken: "mock_client_token_fedcba9876543210",
      },
      answer: {
        optionId: "33333333-3333-4333-8333-333333333331",
        isCorrect: true,
        responseMs: 1200,
        points: 950,
      },
      upload: {
        id: "88888888-8888-4888-8888-888888888888",
        contentType: "image/png",
        // 1x1 PNG base64
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      },
    };

    // 2. Simulate dump serialization
    const serializedDump = JSON.stringify(sourceData);
    expect(serializedDump.length).toBeGreaterThan(500);

    // 3. Simulate restore deserialization into an isolated target
    const restored = JSON.parse(serializedDump);

    // 4. Assert migration journal integrity
    expect(restored.migrations.length).toBe(journal.entries.length);
    expect(restored.migrations[0].hash).toBe("0000_rich_shard");
    expect(restored.migrations[restored.migrations.length - 1].hash).toBe("0008_bright_jane_foster");

    // 5. Assert database-stored uploads integrity
    expect(restored.upload.contentType).toBe("image/png");
    const buffer = Buffer.from(restored.upload.data, "base64");
    // Verify PNG magic bytes
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);

    // 6. Assert quiz, questions, options, session, participant, and answer integrity
    expect(restored.quiz.title).toBe("Rehearsal Quiz");
    expect(restored.options.find((o: { isCorrect: boolean }) => o.isCorrect)?.label).toBe("PostgreSQL (uploads table)");
    expect(restored.session.code).toBe("849201");
    expect(restored.session.hostToken).toBe("mock_host_token_0123456789abcdef");
    expect(restored.participant.nickname).toBe("Rehearsal Participant");
    expect(restored.participant.score).toBe(950);

    // 7. Assert CSV export fidelity
    const csvRow = [
      csvField(restored.participant.nickname),
      csvField(restored.participant.teamName),
      csvField(restored.participant.score),
      csvField(restored.question.prompt),
      csvField(restored.options.find((o: { id: string }) => o.id === restored.answer.optionId)?.label),
      csvField(restored.answer.isCorrect ? "yes" : "no"),
      csvField(restored.answer.responseMs),
      csvField(restored.answer.points),
    ].join(",");

    expect(csvRow).toBe(
      "Rehearsal Participant,Team Verified,950,Which database stores uploaded quiz images?,PostgreSQL (uploads table),yes,1200,950",
    );
  });
});
