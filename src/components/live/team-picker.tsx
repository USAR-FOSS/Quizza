"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchTeams } from "@/lib/teams";

export function TeamPicker({ teams, teamSize, value, onChange }: {
  teams: { name: string; joined: number }[];
  teamSize: number;
  value: string;
  onChange: (name: string) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = searchTeams(teams, query);

  return <div className="relative mt-4" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={`${listId}-input`} className="mb-2 block text-sm font-bold text-ink">Team</label>
    <div className="relative">
      <input id={`${listId}-input`} role="combobox" aria-expanded={open} aria-controls={listId}
        aria-autocomplete="list" autoComplete="off" value={open ? query : value}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(event) => { setQuery(event.target.value); onChange(""); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && open) {
            const first = matches.find((team) => team.joined < teamSize);
            if (first) { event.preventDefault(); onChange(first.name); setOpen(false); }
          }
        }}
        placeholder="Search and select a team"
        className="w-full rounded-2xl border-2 border-ink bg-paper-2 px-4 py-3 pr-10 font-semibold text-ink placeholder:text-ink-soft/60 focus:border-grape focus:bg-white focus:outline-none" />
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
    </div>
    {open && <div id={listId} role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border-2 border-ink bg-paper p-1 shadow-pop-lg">
      {matches.map((team) => {
        const full = team.joined >= teamSize;
        return <button key={team.name} type="button" role="option" aria-selected={value === team.name}
          disabled={full} onClick={() => { onChange(team.name); setOpen(false); }}
          className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-lime/40 disabled:cursor-not-allowed disabled:opacity-45", value === team.name && "bg-lime/50")}>
          <span className="truncate">{team.name}</span><span className="ml-3 shrink-0 text-xs text-ink-soft">{full ? "Full" : `${team.joined}/${teamSize}`}</span>
        </button>;
      })}
      {!matches.length && <p className="px-3 py-2 text-sm text-ink-soft">No matching teams</p>}
      {matches.length === 50 && <p className="px-3 py-2 text-xs text-ink-soft">Search to narrow the list</p>}
    </div>}
  </div>;
}
