"use client";

import { useState } from "react";
import { Eye, Trophy, Users, Shuffle, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import {
  REVEAL_OPTIONS,
  LEADERBOARD_OPTIONS,
  PARTICIPATION_OPTIONS,
  revealPolicy,
  leaderboardPolicy,
  participationMode,
} from "@/lib/quiz-policy";
import type { QuizSettings } from "@/lib/db/schema-types";
import { POWERUP_INFO, POWERUP_ORDER, powerupUses } from "@/lib/powerups";
import { cn } from "@/lib/utils";
import { MAX_TEAM_NAME_LENGTH, MAX_TEAM_NAMES, normalizeTeamNames, parseTeamCsv, searchTeams } from "@/lib/teams";

export function QuizSettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: QuizSettings;
  onChange: (patch: Partial<QuizSettings>) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Quiz settings" onClose={onClose}>
      <Group
        icon={<Eye className="size-4" />}
        title="Show correct answers"
        options={REVEAL_OPTIONS}
        value={revealPolicy(settings)}
        onChange={(v) =>
          onChange({ revealAnswers: v as QuizSettings["revealAnswers"] })
        }
      />

      <Group
        icon={<Trophy className="size-4" />}
        title="Show leaderboard"
        options={LEADERBOARD_OPTIONS}
        value={leaderboardPolicy(settings)}
        onChange={(v) =>
          onChange({ leaderboard: v as QuizSettings["leaderboard"] })
        }
      />

      <Group
        icon={<Users className="size-4" />}
        title="Who can play"
        options={PARTICIPATION_OPTIONS}
        value={participationMode(settings)}
        onChange={(v) =>
          onChange({ participation: v as QuizSettings["participation"] })
        }
      />

      <div className="mt-6">
        <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-ink-soft">
          <Users className="size-4" /> Teams
        </h3>
        <Toggle label="Players choose a team" on={settings.teamSelection ?? false}
          onChange={(teamSelection) => onChange({ teamSelection })} />
        {settings.teamSelection && <TeamSettings settings={settings} onChange={onChange} />}
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-ink-soft">
          <Shuffle className="size-4" />
          Shuffle
        </h3>
        <div className="mt-2 space-y-2">
          <Toggle
            label="Allow players to join after the live quiz starts"
            on={settings.allowLateJoin ?? true}
            onChange={(v) => onChange({ allowLateJoin: v })}
          />
          <Toggle
            label="Shuffle question order"
            on={settings.shuffleQuestions ?? false}
            onChange={(v) => onChange({ shuffleQuestions: v })}
          />
          <Toggle
            label="Shuffle answer options"
            on={settings.shuffleOptions ?? false}
            onChange={(v) => onChange({ shuffleOptions: v })}
          />
        </div>
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 font-display font-bold"><Sparkles className="size-4" /> Make it a game</h3>
        <p className="mb-2 text-sm text-ink-soft">
          Introduce these before play, then let each player choose whether to
          spend one on a question. Keep them off for assessments.
        </p>
        <Toggle
          label="Enable powerups"
          on={settings.powerups ?? false}
          onChange={(v) => onChange({ powerups: v })}
        />
        {settings.powerups && (
          <div className="mt-3 space-y-3 rounded-2xl border border-ink/15 bg-white/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Total powerups per player</p>
            <div className="flex gap-2">
              {([1, 2, 3] as const).map((count) => (
                <button key={count} type="button" aria-pressed={powerupUses(settings) === count}
                  onClick={() => onChange({ powerupUses: count })}
                  className={cn("min-h-11 flex-1 rounded-xl border-2 font-display font-bold transition-colors", powerupUses(settings) === count ? "border-ink bg-lime shadow-pop" : "border-ink/15 bg-paper hover:border-ink")}
                >{count} {count === 1 ? "powerup" : "powerups"}</button>
              ))}
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Available powerups</p>
            {POWERUP_ORDER.map((powerup) => {
              const selected = (settings.powerupTypes ?? POWERUP_ORDER).includes(powerup);
              return (
                <Toggle key={powerup}
                  label={`${POWERUP_INFO[powerup].name}${POWERUP_INFO[powerup].liveOnly ? " · live only" : ""}`}
                  on={selected}
                  onChange={() => {
                    const current = settings.powerupTypes ?? POWERUP_ORDER;
                    const next = selected ? current.filter((item) => item !== powerup) : [...current, powerup];
                    if (next.length) onChange({ powerupTypes: next });
                  }}
                />
              );
            })}
            <p className="text-xs text-ink-soft">Shield blocks attacks. Attack targets one other player and resolves at the live reveal. In scheduled quizzes, only Double up and Safety net appear.</p>
          </div>
        )}
        <div className="mt-2">
          <Toggle
            label="Reward faster answers"
            on={settings.speedBonus ?? false}
            onChange={(v) => onChange({ speedBonus: v })}
          />
          <p className="mt-2 text-sm text-ink-soft">
            Correct answers earn 50–100% of the question’s points, depending on
            speed. Individual question settings can override this.
          </p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="mt-7 flex h-12 w-full items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        Done
      </button>
    </Dialog>
  );
}

function TeamSettings({ settings, onChange }: {
  settings: QuizSettings;
  onChange: (patch: Partial<QuizSettings>) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [importing, setImporting] = useState(false);
  const names = normalizeTeamNames(settings.teamNames ?? []);
  const visible = searchTeams(names.map((name) => ({ name })), filter, 30);

  function addNames(added: string[]): boolean {
    if (!added.length) return false;
    const next = normalizeTeamNames([...names, ...added]);
    if (next.some((name) => name.length > MAX_TEAM_NAME_LENGTH)) {
      setError(`Team names must be ${MAX_TEAM_NAME_LENGTH} characters or less.`);
      return false;
    }
    if (next.length > MAX_TEAM_NAMES) {
      setError(`A quiz can have up to ${MAX_TEAM_NAMES.toLocaleString()} teams.`);
      return false;
    }
    onChange({ teamNames: next });
    setError("");
    return true;
  }

  function addTeams() {
    if (addNames(draft.split(/[\n,]+/).map((name) => name.trim()).filter(Boolean))) setDraft("");
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) { setError("Choose a CSV smaller than 2 MB."); return; }
    setImporting(true);
    try {
      const parsed = parseTeamCsv(await file.text());
      if (!parsed.length) { setError("No team names found in the CSV."); return; }
      addNames(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t read the CSV.");
    } finally {
      setImporting(false);
    }
  }

  return <div className="mt-3 rounded-2xl border border-ink/15 bg-white/60 p-4">
    <p className="text-sm text-ink-soft">Add team names, then set how many players may join each team.</p>
    <label htmlFor="team-names" className="mt-3 block text-xs font-bold uppercase tracking-wider text-ink-soft">Team names</label>
    <textarea id="team-names" value={draft} onChange={(event) => setDraft(event.target.value)}
      placeholder="One name per line, or separate with commas" rows={2} maxLength={500000}
      className="mt-2 w-full rounded-xl border-2 border-ink/20 bg-paper px-3 py-2 text-sm focus:border-grape focus:outline-none" />
    <button type="button" onClick={addTeams} disabled={!draft.trim() || names.length >= MAX_TEAM_NAMES}
      className="mt-2 rounded-xl border-2 border-ink bg-lime px-4 py-2 text-sm font-bold shadow-pop disabled:opacity-40">Add teams</button>
    <label htmlFor="team-csv" className="mt-4 block text-xs font-bold uppercase tracking-wider text-ink-soft">Import CSV</label>
    <input id="team-csv" type="file" accept=".csv,text/csv" disabled={importing || names.length >= MAX_TEAM_NAMES}
      onChange={(event) => {
        void importCsv(event.target.files?.[0]);
        event.target.value = "";
      }} className="mt-2 block w-full text-sm file:mr-3 file:rounded-xl file:border-2 file:border-ink file:bg-paper file:px-3 file:py-2 file:font-bold disabled:opacity-40" />
    <p className="mt-1 text-xs text-ink-soft">One team per row, or a team/name column. Up to {MAX_TEAM_NAMES.toLocaleString()} teams total.</p>
    {error && <p role="alert" className="mt-2 text-sm text-coral">{error}</p>}
    {names.length > 0 && <div className="mt-4">
      <label htmlFor="team-filter" className="text-xs font-bold uppercase tracking-wider text-ink-soft">Teams ({names.length.toLocaleString()})</label>
      <input id="team-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search teams to remove"
        className="mt-2 w-full rounded-xl border border-ink/20 bg-paper px-3 py-2 text-sm focus:border-grape focus:outline-none" />
      <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">{visible.map(({ name }) =>
        <span key={name.toLowerCase()} className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-paper px-3 py-1 text-sm font-semibold">
          {name}<button type="button" onClick={() => onChange({ teamNames: names.filter((item) => item !== name) })}
            aria-label={`Remove ${name}`} className="text-ink-soft hover:text-coral">×</button>
        </span>)}</div>
      {names.length > visible.length && <p className="mt-1 text-xs text-ink-soft">Search to see more teams.</p>}
    </div>}
    <p className="mt-4 text-xs font-bold uppercase tracking-wider text-ink-soft">Players per team</p>
    <div className="mt-2 grid grid-cols-4 gap-2">{([1, 2, 3, 4] as const).map((size) =>
      <button key={size} type="button" aria-pressed={(settings.teamSize ?? 1) === size}
        onClick={() => onChange({ teamSize: size })}
        className={cn("min-h-11 rounded-xl border-2 font-display font-bold transition-colors", (settings.teamSize ?? 1) === size ? "border-ink bg-lime shadow-pop" : "border-ink/15 bg-paper hover:border-ink")}>{size}</button>)}</div>
    {!names.length && <p className="mt-3 text-sm text-coral">Add at least one team before launching.</p>}
  </div>;
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className="flex w-full items-center justify-between rounded-2xl border-2 border-ink/20 bg-paper-2 p-3 text-left transition-colors hover:border-ink/40"
    >
      <span className="font-display font-bold text-ink">{label}</span>
      <span
        className={cn(
          "flex h-6 w-10 shrink-0 items-center rounded-full border-2 border-ink p-0.5 transition-colors",
          on ? "bg-grape" : "bg-paper",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-ink transition-transform",
            on ? "translate-x-4 bg-white" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

function Group({
  icon,
  title,
  options,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  options: { value: string; label: string; blurb: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-6">
      <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-ink-soft">
        {icon}
        {title}
      </h3>
      <div className="mt-2 space-y-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left transition-transform hover:-translate-y-0.5",
              value === o.value
                ? "border-ink bg-white shadow-pop"
                : "border-ink/20 bg-paper-2",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-ink",
                value === o.value ? "bg-grape" : "bg-paper",
              )}
            >
              {value === o.value && (
                <span className="size-2 rounded-full bg-white" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-display font-bold text-ink">
                {o.label}
              </span>
              <span className="block text-sm text-ink-soft">{o.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
