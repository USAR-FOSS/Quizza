"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Check, Download } from "lucide-react";
import { api, ApiClientError, type Results } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/site/logo";
import { formatJoinCode } from "@/lib/codes";
import { cn } from "@/lib/utils";

export function ResultsView({ code }: { code: string }) {
  const [results, setResults] = useState<Results | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [hostToken, setHostToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // the host holds the host token (stored at launch) and sees full results
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem(`quizza:host:${code}`)
          : null;
      setHostToken(token);
      setResults(await api.getResults(code, token ?? undefined));
      setStatus("ok");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) setStatus("notfound");
      else setStatus("ok");
    } finally {
      setRefreshing(false);
    }
  }, [code]);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      setRefreshing(true);
      load();
    }, 8000);
    return () => clearInterval(id);
  }, [load]);

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
            <a
              href={`/api/v1/sessions/${code}/export?host=${encodeURIComponent(hostToken)}`}
              className="flex items-center gap-1.5 rounded-xl border-2 border-ink bg-paper px-3 py-1.5 font-display text-sm font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
            >
              <Download className="size-4" />
              CSV
            </a>
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
        {status === "loading" ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-8 animate-spin text-grape" />
          </div>
        ) : status === "notfound" ? (
          <p className="py-20 text-center text-ink-soft">No results for code {code}.</p>
        ) : results ? (
          <>
            <div className="flex items-baseline justify-between">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
                Results
              </h1>
              <span className="font-display text-sm font-bold text-ink-soft">
                {results.totalParticipants}{" "}
                {results.totalParticipants === 1 ? "participant" : "participants"}
              </span>
            </div>

            {/* leaderboard */}
            <section className="mt-5 rounded-3xl border-2 border-ink bg-paper p-4 shadow-pop">
              <h2 className="px-1 font-display text-sm font-bold uppercase tracking-widest text-ink-soft">
                Leaderboard
              </h2>
              {results.leaderboard.length === 0 ? (
                <p className="p-4 text-center text-ink-soft">No submissions yet.</p>
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
                      <Avatar name={e.nickname} color={e.avatarColor} size="sm" />
                      <span className="min-w-0 flex-1 truncate font-display font-bold text-ink">
                        {e.nickname}
                      </span>
                      <span className="font-display font-extrabold text-ink">{e.score}</span>
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
                      {q.responses} {q.responses === 1 ? "response" : "responses"}
                    </span>
                  </div>

                  {q.options.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {q.options.map((o) => {
                        const pct =
                          q.responses > 0 ? Math.round((o.count / q.responses) * 100) : 0;
                        return (
                          <div key={o.optionId}>
                            <div className="flex items-center justify-between text-sm font-semibold text-ink">
                              <span className="flex items-center gap-1.5">
                                {o.isCorrect && <Check className="size-4 text-mint" strokeWidth={3} />}
                                {o.label || "(empty)"}
                              </span>
                              <span className="text-ink-soft">
                                {o.count} ({pct}%)
                              </span>
                            </div>
                            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2">
                              <div
                                className={cn("h-full", o.isCorrect ? "bg-mint" : "bg-grape")}
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
                      Average: <span className="font-extrabold">{q.numberAverage.toFixed(1)}</span>
                    </p>
                  )}

                  {q.textValues.length > 0 && (
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
