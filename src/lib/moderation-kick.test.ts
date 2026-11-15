import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

const quizSettingsSchema = z.object({
  title: z.string().optional(),
  maxParticipants: z.number().int().min(1).max(10000).optional(),
});

describe("Host Moderation & Capacity Caps", () => {
  it("validates maxParticipants settings bounds", () => {
    expect(quizSettingsSchema.safeParse({ maxParticipants: 50 }).success).toBe(true);
    expect(quizSettingsSchema.safeParse({ maxParticipants: 1 }).success).toBe(true);
    expect(quizSettingsSchema.safeParse({ maxParticipants: 10000 }).success).toBe(true);
    expect(quizSettingsSchema.safeParse({ maxParticipants: 0 }).success).toBe(false);
    expect(quizSettingsSchema.safeParse({ maxParticipants: -1 }).success).toBe(false);
    expect(quizSettingsSchema.safeParse({ maxParticipants: 10001 }).success).toBe(false);
    expect(quizSettingsSchema.safeParse({ maxParticipants: 3.5 }).success).toBe(false);
  });

  it("checks room capacity cap during join", () => {
    const checkCapacity = (currentCount: number, maxParticipants?: number) => {
      if (maxParticipants && maxParticipants > 0) {
        if (currentCount >= maxParticipants) {
          throw new Error(`room_full: maximum ${maxParticipants} participants reached`);
        }
      }
      return true;
    };

    expect(checkCapacity(5, 10)).toBe(true);
    expect(checkCapacity(9, 10)).toBe(true);
    expect(() => checkCapacity(10, 10)).toThrow("room_full");
    expect(() => checkCapacity(15, 10)).toThrow("room_full");
    expect(checkCapacity(100, undefined)).toBe(true);
  });

  it("validates kick participant security checks", () => {
    const validateKick = (
      session: { hostToken: string; status: string },
      providedToken: string,
      participantFound: boolean,
    ) => {
      if (session.hostToken !== providedToken) {
        throw new Error("403: Invalid host token");
      }
      if (session.status === "ended") {
        throw new Error("409: Session has already ended");
      }
      if (!participantFound) {
        throw new Error("404: Participant not found");
      }
      return { ok: true };
    };

    const session = { hostToken: "secret-token-123", status: "lobby" };

    // Valid kick
    expect(validateKick(session, "secret-token-123", true)).toEqual({ ok: true });

    // Wrong token
    expect(() => validateKick(session, "wrong-token", true)).toThrow("403: Invalid host token");

    // Session ended
    expect(() => validateKick({ ...session, status: "ended" }, "secret-token-123", true)).toThrow("409: Session has already ended");

    // Participant not in room
    expect(() => validateKick(session, "secret-token-123", false)).toThrow("404: Participant not found");
  });
});
