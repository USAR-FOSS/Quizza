"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Check,
  Download,
  Trophy,
  Users,
  MessageCircle,
  LockKeyhole,
} from "lucide-react";
import { api, ApiClientError, type Results } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/site/logo";
import { formatJoinCode } from "@/lib/codes";
import { cn } from "@/lib/utils";
import { recoverHostToken } from "@/lib/actions/host";
import { LoadingState } from "@/components/ui/loading-state";
import { QuizBuddy } from "@/components/ui/quiz-buddy";
import { WordCloud } from "@/components/ui/word-cloud";

export function ResultsView({ code }: { code: string }) {
  const [results, setResults] = useState<Results | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">(
    "loading",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      // the host holds the host token (stored at launch) and sees full results
      const stored =
        typeof window !== "undefined"
          ? localStorage.getItem(`quizza:host:${code}`)
          : null;
      const token = stored ?? (await recoverHostToken(code));
      if (token) localStorage.setItem(`quizza:host:${code}`, token);
      const next = await api.getResults(code, token ?? undefined);
      setHostToken(token);
      setResults(next);
      setError("");
      setStatus("ok");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404)
        setStatus("notfound");
      else {
        setStatus("error");
        setError(
          "Couldn’t refresh the results. Check your connection and try again.",
        );
      }
    } finally {
      setRefreshing(false);
    }
  }, [code]);

  useEffect(() => {
    const firstLoad = setTimeout(() => void load(), 0);
    const id = setInterval(() => {
      setRefreshing(true);
      load();
    }, 8000);
    return () => {
      clearTimeout(firstLoad);
      clearInterval(id);
    };
  }, [load]);

  async function download(format: "csv" | "json") {
    if (!hostToken || !results) return;
    setExporting(true);
    setError("");
    try {
      let blob: Blob;
      if (format === "csv") {
        const response = await fetch(`/api/v1/sessions/${code}/export`, {
          headers: { authorization: `Bearer ${hostToken}` },
        });
        if (!response.ok) throw new Error("Export failed");
        blob = await response.blob();
      } else
        blob = new Blob([JSON.stringify(results, null, 2)], {
          type: "application/json",
        });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `quizza-${code}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Couldn’t download this export. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper-2">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b-2 border-ink/10 bg-paper/90 px-5 backdrop-blur-md">
        <Link href="/">
          <Logo className="h-7" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-ink-soft">
            {formatJoinCode(code)}
          </span>
          {hostToken && (
            <button
              disabled={exporting}
              onClick={() => void download("csv")}
              className="flex items-center gap-1.5 rounded-xl border-2 border-ink bg-paper px-3 py-1.5 font-display text-sm font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
            >
              <Download className="size-4" />
              CSV
            </button>
          )}
          <button
            onClick={() => {
              setRefreshing(true);
              load();
            }}
            className="flex items-center gap-1.5 rounded-xl border-2 border-ink bg-paper px-3 py-1.5 font-display text-sm font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-coral/40 bg-coral/10 p-4 text-sm"
          >
            {error}
          </p>
        )}
        {status === "loading" ? (
          <LoadingState label="Loading results…" />
        ) : status === "notfound" ? (
          <p className="py-20 text-center text-ink-soft">
            No results for code {code}.
          </p>
        ) : results ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
                Results
              </h1>
              <span className="font-display text-sm font-bold text-ink-soft">
                {results.totalParticipants}{" "}
                {results.totalParticipants === 1
                  ? "participant"
                  : "participants"}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {results.over ? "Final results" : "Updates while the quiz is open."}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                {
                  Icon: Users,
                  value: results.totalParticipants,
                  label: "People playing",
                },
                {
                  Icon: MessageCircle,
                  value: results.questionStats.reduce(
                    (n, q) => n + q.responses,
                    0,
                  ),
                  label: "Answers collected",
                },
                {
                  Icon: Trophy,
                  value: results.leaderboard[0]?.score ?? "—",
                  label: "Leading score",
                },
              ].map(({ Icon, value, label }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-ink/15 bg-paper p-4"
                >
                  <Icon className="size-5 text-grape" />
                  <p className="mt-2 font-display text-2xl font-extrabold">
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">{label}</p>
                </div>
              ))}
            </div>
            {hostToken && (
              <button
                disabled={exporting}
                onClick={() => void download("json")}
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-grape"
              >
                <Download className="size-4" />
                Download result summary as JSON
              </button>
            )}

            {/* leaderboard */}
            <section className="mt-5 rounded-3xl border-2 border-ink bg-paper p-4 shadow-pop">
              <h2 className="px-1 font-display text-sm font-bold uppercase tracking-widest text-ink-soft">
                Leaderboard
              </h2>
              {results.leaderboard.length === 0 ? (
                <div className="p-5 text-center">
                  <QuizBuddy className="mx-auto w-28" />
                  {!results.showBoard && (
                    <LockKeyhole className="mx-auto mb-2 size-5 text-grape" />
                  )}
                  <p className="text-sm text-ink-soft">
                    {!results.showBoard
                      ? "Leaderboard hidden by settings."
                      : "No scores yet."}
                  </p>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {results.leaderboard.map((e) => (
                    <div
                      key={e.participantId}
                      className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-paper-2 p-2.5"
                    >
                      <span className="w-6 text-center font-display font-extrabold text-ink-soft">
                        {e.rank}
                      </span>
                      <Avatar
                        src={e.avatarUrl}
                        name={e.nickname}
                        color={e.avatarColor}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate font-display font-bold text-ink">
                        {e.nickname}{e.teamName && <span className="ml-2 font-sans text-xs font-medium text-ink-soft">{e.teamName}</span>}
                      </span>
                      <span className="font-display font-extrabold text-ink">
                        {e.score}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* per-question stats */}
            <section className="mt-6 space-y-4">
              {results.questionStats.map((q, i) => (
                <div
                  key={q.questionId}
                  className="rounded-3xl border-2 border-ink bg-paper p-5 shadow-pop"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-lg font-bold text-ink">
                      {i + 1}. {q.prompt || "Untitled question"}
                    </h3>
                    <span className="shrink-0 text-sm font-bold text-ink-soft">
                      {q.responses}{" "}
                      {q.responses === 1 ? "response" : "responses"}
                    </span>
                  </div>

                  {q.options.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {q.options.map((o) => {
                        const pct =
                          q.responses > 0
                            ? Math.round((o.count / q.responses) * 100)
                            : 0;
                        return (
                          <div key={o.optionId}>
                            <div className="flex items-center justify-between text-sm font-semibold text-ink">
                              <span className="flex items-center gap-1.5">
                                {o.isCorrect && (
                                  <Check
                                    className="size-4 text-mint"
                                    strokeWidth={3}
                                  />
                                )}
                                {o.label || "(empty)"}
                              </span>
                              <span className="text-ink-soft">
                                {o.count} ({pct}%)
                              </span>
                            </div>
                            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2">
                              <div
                                className={cn(
                                  "h-full",
                                  o.isCorrect ? "bg-mint" : "bg-grape",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.numberAverage !== null && (
                    <p className="mt-3 font-display text-ink">
                      Average:{" "}
                      <span className="font-extrabold">
                        {q.numberAverage.toFixed(1)}
                      </span>
                    </p>
                  )}

                  {q.type === "word_cloud" && (
                    <WordCloud values={q.textValues} />
                  )}
                  {q.type !== "word_cloud" && q.textValues.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {q.textValues.map((t, j) => (
                        <span
                          key={j}
                          className="rounded-lg border-2 border-ink bg-paper-2 px-2.5 py-1 text-sm font-semibold text-ink"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
