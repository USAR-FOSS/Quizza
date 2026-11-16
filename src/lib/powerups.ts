import type { Powerup, QuizSettings } from "@/lib/db/schema-types";

export type { Powerup };

export const POWERUP_ORDER: Powerup[] = ["double", "safety_net", "shield", "attack", "fifty_fifty"];
export const POWERUP_INFO: Record<Powerup, { name: string; description: string; liveOnly?: boolean }> = {
  double: { name: "Double up", description: "Double the points from a correct answer." },
  safety_net: { name: "Safety net", description: "Even a wrong answer earns one third of this question’s points." },
  shield: { name: "Shield", description: "Block attacks aimed at you on this question.", liveOnly: true },
  attack: { name: "Attack", description: "Pick a player. If they answer correctly, take their question points; otherwise take up to one third of this question’s points from their score.", liveOnly: true },
  fifty_fifty: { name: "50:50", description: "Eliminate two incorrect options on choice questions." },
};

/** Selects 2 incorrect options to eliminate for a 50:50 powerup. */
export function selectFiftyFiftyOptionIds(
  options: Array<{ id: string; isCorrect: boolean }>,
  seedKey?: string,
): string[] {
  if (options.length <= 2) return [];
  const incorrect = options.filter((o) => !o.isCorrect);
  if (incorrect.length < 2) return [];
  const seed = seedKey ?? "";
  const hash = (id: string) => {
    let h = 0;
    const str = seed + id;
    for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  };
  return [...incorrect]
    .sort((a, b) => hash(a.id) - hash(b.id))
    .slice(0, 2)
    .map((o) => o.id);
}

export function powerupUses(settings: QuizSettings | null | undefined): number {
  return Math.max(1, Math.min(3, settings?.powerupUses ?? 1));
}

export function powerupsLeft(uses: number, used: Powerup[]): number {
  return Math.max(0, uses - used.length);
}

export function enabledPowerups(settings: QuizSettings | null | undefined, mode: "live" | "scheduled"): Powerup[] {
  if (!settings?.powerups) return [];
  const configured = settings.powerupTypes ?? POWERUP_ORDER;
  return POWERUP_ORDER.filter((powerup) => configured.includes(powerup) && (mode === "live" || !POWERUP_INFO[powerup].liveOnly));
}

export function applyPowerup(
  points: number,
  basePoints: number,
  correct: boolean,
  powerup?: Powerup,
): number {
  if (powerup === "double") return points * 2;
  if (powerup === "safety_net" && !correct) return Math.round(basePoints / 3);
  return points;
}

export type AttackAnswer = {
  id: string;
  participantId: string;
  powerup: Powerup | null;
  powerupTargetId: string | null;
  isCorrect: boolean;
  points: number;
  createdAt: Date;
};

/** Deterministic settlement: earlier attacks get first claim; nobody goes negative. */
export function planAttackSettlements(
  rows: AttackAnswer[],
  players: { id: string; score: number }[],
  questionPoints: number,
) {
  const scores = new Map(players.map((player) => [player.id, player.score]));
  const answersByPlayer = new Map(rows.map((answer) => [answer.participantId, answer]));
  const remainingAward = new Map(rows.map((answer) => [answer.participantId, answer.points]));
  const outcomes: { answerId: string; stolen: number; blocked: boolean }[] = [];
  const attacks = rows.filter((row) => row.powerup === "attack" && row.powerupTargetId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  for (const attack of attacks) {
    const targetId = attack.powerupTargetId!;
    if (targetId === attack.participantId || !scores.has(targetId)) continue;
    const targetAnswer = answersByPlayer.get(targetId);
    const blocked = targetAnswer?.powerup === "shield";
    const currentScore = scores.get(targetId)!;
    const available = targetAnswer?.isCorrect
      ? remainingAward.get(targetId) ?? 0
      : Math.round(questionPoints / 3);
    const stolen = blocked ? 0 : Math.max(0, Math.min(available, currentScore));
    scores.set(targetId, currentScore - stolen);
    scores.set(attack.participantId, (scores.get(attack.participantId) ?? 0) + stolen);
    if (targetAnswer?.isCorrect)
      remainingAward.set(targetId, Math.max(0, available - stolen));
    outcomes.push({ answerId: attack.id, stolen, blocked });
  }
  return { scores, outcomes };
}
