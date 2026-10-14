import { customAlphabet } from "nanoid";

/**
 * Join codes are what a participant types to enter a room.
 * Digits only - easy to read off a projector and type on a phone.
 * 6 digits => 900k space, plenty since codes are reused once a session ends.
 */
const digits = customAlphabet("0123456789", 6);

export function generateJoinCode(): string {
  return digits();
}

/** "428193" -> "428 193" for friendlier display. */
export function formatJoinCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Opaque secrets for host control + participant reconnection. */
const token = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  32,
);

export function generateToken(): string {
  return token();
}
