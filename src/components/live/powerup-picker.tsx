"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, Shield, Swords, Zap } from "lucide-react";
import { api } from "@/lib/api-client";
import { POWERUP_INFO, POWERUP_ORDER, type Powerup } from "@/lib/powerups";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const icons = { double: Zap, safety_net: LifeBuoy, shield: Shield, attack: Swords };

export function PowerupIntro({ types, uses }: { types: Powerup[]; uses: number }) {
  if (!types.length) return null;
  return (
    <div className="mt-5 rounded-2xl border-2 border-ink/15 bg-sun/10 p-4 text-left">
      <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Your game kit · {uses} {uses === 1 ? "use" : "uses"} of each</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {POWERUP_ORDER.filter((item) => types.includes(item)).map((item) => {
          const Icon = icons[item];
          return <div key={item} className="flex gap-2 rounded-xl bg-white/80 p-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-grape" />
            <div><strong className="font-display text-sm">{POWERUP_INFO[item].name}</strong><p className="text-xs leading-relaxed text-ink-soft">{POWERUP_INFO[item].description}</p></div>
          </div>;
        })}
      </div>
      <p className="mt-3 text-xs text-ink-soft">Choose at most one for a scored question. You can always save it for later.</p>
    </div>
  );
}

export function PowerupPicker({
  selected, used, uses, available, onChange, disabled,
  code, clientToken, targetId, onTargetChange,
}: {
  selected?: Powerup;
  used: Powerup[];
  uses: number;
  available: Powerup[];
  onChange: (value?: Powerup) => void;
  disabled?: boolean;
  code?: string;
  clientToken?: string;
  targetId?: string;
  onTargetChange?: (id?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [targets, setTargets] = useState<Awaited<ReturnType<typeof api.searchTargets>>>([]);
  const [targetError, setTargetError] = useState("");
  useEffect(() => {
    if (selected !== "attack" || !code || !clientToken) return;
    let alive = true;
    const timer = setTimeout(() => {
      api.searchTargets(code, clientToken, search).then((rows) => {
        if (alive) { setTargets(rows); setTargetError(""); }
      }).catch(() => { if (alive) setTargetError("Couldn’t find players right now. Try again."); });
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [selected, code, clientToken, search]);

  if (!available.length) return null;
  return (
    <fieldset disabled={disabled} className="mt-5 rounded-2xl border border-ink/15 bg-white/60 p-3 disabled:opacity-50">
      <legend className="px-1 text-xs font-bold uppercase tracking-wider text-ink-soft">Powerup for this question · optional</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {POWERUP_ORDER.filter((item) => available.includes(item)).map((item) => {
          const Icon = icons[item];
          const left = Math.max(0, uses - used.filter((value) => value === item).length);
          return <button key={item} type="button" disabled={left === 0}
            aria-pressed={selected === item}
            onClick={() => { onChange(selected === item ? undefined : item); onTargetChange?.(undefined); }}
            className={cn("flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-bold transition-colors disabled:opacity-40", selected === item ? "border-ink bg-lime shadow-pop" : "border-ink/15 bg-paper hover:border-ink")}
          ><Icon className="size-4 shrink-0" /><span className="flex-1">{POWERUP_INFO[item].name}</span><span className="text-xs tabular-nums text-ink-soft">{left} left</span></button>;
        })}
      </div>
      {selected && <p role="status" className="mt-3 text-xs text-ink-soft">{POWERUP_INFO[selected].description}</p>}
      {selected === "attack" && code && clientToken && (
        <div className="mt-3 rounded-xl border border-ink/15 bg-paper p-3">
          <label htmlFor="attack-target-search" className="text-xs font-bold uppercase tracking-wider text-ink-soft">Choose who to attack</label>
          <input id="attack-target-search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search players" maxLength={40}
            className="mt-2 h-11 w-full rounded-xl border border-ink/20 bg-white px-3 text-sm focus:outline-2 focus:outline-grape" />
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
            {targets.map((target) => <button key={target.id} type="button" aria-pressed={targetId === target.id}
              onClick={() => onTargetChange?.(target.id)}
              className={cn("flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left text-sm font-semibold", targetId === target.id ? "border-grape bg-grape/10" : "border-transparent hover:bg-white")}
            ><Avatar name={target.nickname} color={target.avatarColor} src={target.avatarUrl} size="sm" />{target.nickname}</button>)}
            {!targets.length && !targetError && <p className="p-2 text-xs text-ink-soft">No matching players yet.</p>}
            {targetError && <p role="alert" className="p-2 text-xs text-coral">{targetError}</p>}
          </div>
        </div>
      )}
    </fieldset>
  );
}
