"use client";
import { motion } from "motion/react";
import { Avatar } from "@/components/ui/avatar";
import { QuizBuddy } from "@/components/ui/quiz-buddy";
import type { LiveLeaderboardEntry } from "@/lib/realtime/events";

function seed(id: string) {
  return [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
}

export function LobbyCrowd({
  players,
  meId,
}: {
  players: LiveLeaderboardEntry[];
  meId?: string;
}) {
  return (
    <section
      aria-label="Players in the room"
      className="relative mt-5 overflow-hidden rounded-[2rem] border-2 border-ink/10 bg-gradient-to-br from-grape/10 via-paper to-lime/25 px-4 py-5"
    >
      <div className="pointer-events-none absolute -right-6 -top-3 rotate-12 opacity-30">
        <QuizBuddy className="w-32" mood="wave" />
      </div>
      <div className="relative flex max-h-80 min-h-32 flex-wrap items-center justify-center gap-x-4 gap-y-4 overflow-y-auto py-2 sm:gap-x-5">
        {players.length === 0 ? (
          <div className="py-4 text-center">
            <QuizBuddy className="mx-auto w-28" mood="wave" />
            <p className="text-sm text-ink-soft">
              The room’s ready. Send out the invite.
            </p>
          </div>
        ) : (
          players.slice(0, 60).map((p) => {
            const hash = seed(p.participantId);
            const size = 44 + (hash % 35);
            return (
              <motion.div
                key={p.participantId}
                initial={{ opacity: 0, scale: 0.3, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 250, damping: 18 }}
                className="flex w-16 flex-col items-center gap-1 sm:w-20"
                style={{ paddingTop: hash % 17 }}
              >
                <div
                  style={{
                    width: size,
                    height: size,
                    animationDelay: `${-(hash % 40) / 10}s`,
                  }}
                  className="avatar-bob"
                >
                  <Avatar
                    src={p.avatarUrl}
                    name={p.nickname}
                    color={p.avatarColor}
                    className="size-full text-2xl shadow-pop"
                  />
                </div>
                <span
                  className="max-w-full truncate text-xs font-bold"
                  title={p.nickname}
                >
                  {p.nickname}
                  {p.participantId === meId ? " (you)" : ""}
                </span>
              </motion.div>
            );
          })
        )}
      </div>
      {players.length > 60 && (
        <p className="mt-3 text-center text-sm font-bold">
          +{players.length - 60} more in the room
        </p>
      )}
    </section>
  );
}
