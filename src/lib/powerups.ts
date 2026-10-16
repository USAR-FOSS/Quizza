export type Powerup = "double" | "shield";

export function applyPowerup(
  points: number,
  basePoints: number,
  correct: boolean,
  powerup?: Powerup,
): number {
  if (powerup === "double") return points * 2;
  if (powerup === "shield" && !correct) return Math.round(basePoints / 2);
  return points;
}
