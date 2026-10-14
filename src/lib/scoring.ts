/**
 * Scoring is pure and shared by both run modes (live and scheduled), so a
 * response earns the same points regardless of how the session is run.
 */

export type ScoreInput = {
  scorable: boolean; // is this question type scored at all
  isCorrect: boolean;
  basePoints: number;
  timeLimitSec: number;
  responseMs: number | null; // time taken to answer, if known
  speedBonus: boolean; // whether faster answers earn more
};

/**
 * Points for a single answer.
 * - Non-scorable questions or wrong answers earn 0.
 * - With speed bonus: full points for an instant answer, scaling down to half
 *   points at the time limit. Never below half for a correct answer.
 * - Without speed bonus: full points for correct, 0 for wrong.
 */
export function computePoints(input: ScoreInput): number {
  if (!input.scorable || !input.isCorrect) return 0;
  if (!input.speedBonus || input.responseMs == null) return input.basePoints;

  const limitMs = Math.max(1, input.timeLimitSec * 1000);
  const fraction = Math.min(1, Math.max(0, input.responseMs / limitMs));
  return Math.round(input.basePoints * (1 - 0.5 * fraction));
}

/**
 * Clamp a client-reported elapsed time to a sane range for a question, so a
 * self-paced (scheduled) submission cannot report a negative or absurd time.
 */
export function clampResponseMs(
  elapsedMs: number | null | undefined,
  timeLimitSec: number,
): number | null {
  if (elapsedMs == null || Number.isNaN(elapsedMs)) return null;
  const limitMs = timeLimitSec * 1000;
  return Math.min(limitMs, Math.max(0, Math.round(elapsedMs)));
}
