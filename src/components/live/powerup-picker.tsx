"use client";

import { Shield, Zap } from "lucide-react";
import type { Powerup } from "@/lib/powerups";
import { cn } from "@/lib/utils";

export function PowerupPicker({
  selected,
  used,
  onChange,
  disabled,
}: {
  selected?: Powerup;
  used: Powerup[];
  onChange: (value?: Powerup) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="mt-5 rounded-2xl border border-ink/15 bg-white/60 p-3 disabled:opacity-50"
    >
      <legend className="px-1 text-xs font-bold uppercase tracking-wider text-ink-soft">
        A little advantage · once each per game
      </legend>
      <div className="flex flex-wrap gap-2">
        {(
          [
            {
              id: "double",
              label: "Double points",
              Icon: Zap,
              description: "2× points for a correct answer",
            },
            {
              id: "shield",
              label: "Safety shield",
              Icon: Shield,
              description: "Keep half the base points if you miss",
            },
          ] as const
        ).map(({ id, label, Icon, description }) => (
          <button
            key={id}
            type="button"
            disabled={used.includes(id)}
            aria-pressed={selected === id}
            title={description}
            onClick={() => onChange(selected === id ? undefined : id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors disabled:opacity-40",
              selected === id
                ? "border-ink bg-lime shadow-pop"
                : "border-ink/15 bg-paper hover:border-ink",
            )}
          >
            <Icon className="size-4" />
            {used.includes(id) ? `${label} used` : label}
          </button>
        ))}
      </div>
      {selected && (
        <p className="mt-2 text-xs text-ink-soft" role="status">
          {selected === "double"
            ? "Go for it. Your correct answer earns twice the points."
            : "A soft landing. A wrong answer still earns half the base points."}
        </p>
      )}
    </fieldset>
  );
}
