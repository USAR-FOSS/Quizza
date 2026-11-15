"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Radio,
  Users,
  Trophy,
  Layers,
  RefreshCw,
  PowerOff,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { Logo } from "@/components/site/logo";
import { LoadingState } from "@/components/ui/loading-state";
import { formatJoinCode } from "@/lib/codes";
import type { AdminOverviewData } from "@/lib/admin";

export function AdminOverviewClient() {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadData = async () => {
    setError("");
    try {
      const res = await fetch("/api/v1/admin/overview");
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "Administrative privileges required."
            : "Failed to load platform overview.",
        );
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleTerminate = (sessionId: string, code: string) => {
    if (
      !window.confirm(
        `Are you sure you want to terminate session ${formatJoinCode(code)}? All connected players will be disconnected.`,
      )
    ) {
      return;
    }

    setTerminatingId(sessionId);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/admin/sessions/${sessionId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to terminate session.");
        await loadData();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Termination failed.");
      } finally {
        setTerminatingId(null);
      }
    });
  };

  return (
    <div className="min-h-screen bg-paper-2">
      <header className="flex h-16 items-center justify-between border-b-2 border-ink/10 bg-paper px-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Logo className="h-7" />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-grape/30 bg-grape/10 px-2.5 py-1 font-display text-xs font-bold text-grape">
            <ShieldAlert className="size-3.5" />
            Platform Admin
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            aria-label="Refresh metrics"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-ink bg-paper px-3 py-1.5 font-display text-xs font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 bg-paper px-3 py-1.5 font-display text-xs font-bold text-ink transition-colors hover:border-ink"
          >
            <ArrowLeft className="size-3.5" /> Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-2xl border-2 border-coral bg-coral/10 p-4 text-sm font-bold text-coral">
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="py-20">
            <LoadingState label="Loading platform telemetry…" />
          </div>
        ) : data ? (
          <div className="space-y-8">
            {/* Telemetry Metrics Grid */}
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="rounded-2xl border-2 border-ink bg-paper p-4 shadow-pop">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Active Rooms
                  </span>
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-mint" />
                  </span>
                </div>
                <p className="mt-2 font-display text-3xl font-extrabold text-ink">
                  {data.stats.activeSessionsCount}
                </p>
                <p className="text-xs text-ink-soft">Live right now</p>
              </div>

              <div className="rounded-2xl border-2 border-ink bg-paper p-4 shadow-pop">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Total Sessions
                  </span>
                  <Radio className="size-4 text-grape" />
                </div>
                <p className="mt-2 font-display text-3xl font-extrabold text-ink">
                  {data.stats.totalSessionsCount}
                </p>
                <p className="text-xs text-ink-soft">All-time hosted</p>
              </div>

              <div className="rounded-2xl border-2 border-ink bg-paper p-4 shadow-pop">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Quizzes
                  </span>
                  <Layers className="size-4 text-sun" />
                </div>
                <p className="mt-2 font-display text-3xl font-extrabold text-ink">
                  {data.stats.totalQuizzesCount}
                </p>
                <p className="text-xs text-ink-soft">Created quizzes</p>
              </div>

              <div className="rounded-2xl border-2 border-ink bg-paper p-4 shadow-pop">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Registered Hosts
                  </span>
                  <Users className="size-4 text-sky-500" />
                </div>
                <p className="mt-2 font-display text-3xl font-extrabold text-ink">
                  {data.stats.totalUsersCount}
                </p>
                <p className="text-xs text-ink-soft">User accounts</p>
              </div>

              <div className="rounded-2xl border-2 border-ink bg-paper p-4 shadow-pop">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Players Joined
                  </span>
                  <Trophy className="size-4 text-mint" />
                </div>
                <p className="mt-2 font-display text-3xl font-extrabold text-ink">
                  {data.stats.totalParticipantsCount}
                </p>
                <p className="text-xs text-ink-soft">Cumulative participants</p>
              </div>
            </section>

            {/* Active Sessions List */}
            <section className="rounded-3xl border-2 border-ink bg-paper p-6 shadow-pop">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-ink">
                    Active Session Fleet
                  </h2>
                  <p className="text-xs text-ink-soft">
                    Real-time monitor and emergency kill-switch for running sessions
                  </p>
                </div>
                <span className="rounded-xl border border-ink/15 bg-paper-2 px-3 py-1 font-display text-xs font-bold">
                  {data.activeSessions.length} Running
                </span>
              </div>

              {data.activeSessions.length === 0 ? (
                <div className="py-12 text-center text-ink-soft">
                  <Radio className="mx-auto mb-2 size-8 text-ink-soft/40" />
                  <p className="font-display text-sm font-bold">
                    No active sessions currently running.
                  </p>
                  <p className="mt-1 text-xs">
                    New live or scheduled rooms will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b-2 border-ink/10 text-xs font-bold uppercase tracking-wider text-ink-soft">
                        <th className="pb-3 pr-4">Code</th>
                        <th className="pb-3 pr-4">Quiz Title</th>
                        <th className="pb-3 pr-4">Host</th>
                        <th className="pb-3 pr-4">Mode</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3 pr-4">Players</th>
                        <th className="pb-3 text-right">Emergency Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5 text-sm">
                      {data.activeSessions.map((s) => (
                        <tr key={s.id} className="hover:bg-paper-2/60">
                          <td className="py-3.5 pr-4 font-mono font-bold text-ink">
                            {formatJoinCode(s.code)}
                          </td>
                          <td className="py-3.5 pr-4 font-semibold text-ink">
                            {s.quizTitle}
                          </td>
                          <td className="py-3.5 pr-4 text-xs text-ink-soft">
                            {s.ownerEmail ?? "Anonymous"}
                          </td>
                          <td className="py-3.5 pr-4">
                            <span className="rounded-lg bg-paper-2 px-2 py-0.5 font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
                              {s.mode}
                            </span>
                          </td>
                          <td className="py-3.5 pr-4">
                            <span
                              className={`rounded-lg px-2 py-0.5 font-display text-xs font-bold uppercase tracking-wider ${
                                s.status === "active"
                                  ? "bg-mint/20 text-mint-dark"
                                  : "bg-sun/30 text-ink"
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="py-3.5 pr-4 font-display font-extrabold text-ink">
                            {s.participantCount}
                          </td>
                          <td className="py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/results/${s.code}`}
                                target="_blank"
                                className="inline-flex size-8 items-center justify-center rounded-lg border border-ink/20 text-ink-soft transition-colors hover:border-ink hover:text-ink"
                                title="Inspect Results"
                              >
                                <ExternalLink className="size-4" />
                              </Link>
                              <button
                                type="button"
                                disabled={terminatingId === s.id}
                                onClick={() => handleTerminate(s.id, s.code)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-coral/30 bg-coral/10 px-2.5 py-1 font-display text-xs font-bold text-coral transition-colors hover:bg-coral hover:text-white disabled:opacity-50"
                                title="Emergency Terminate Session"
                              >
                                <PowerOff className="size-3.5" />
                                Terminate
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
