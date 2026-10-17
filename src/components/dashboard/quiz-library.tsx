"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Pencil, Play, Search, ArrowRight } from "lucide-react";
import { coverIcon } from "@/components/ui/quiz-icons";
import { QuizBuddy } from "@/components/ui/quiz-buddy";
import { DeleteQuiz } from "@/components/dashboard/delete-quiz";
import { duplicateQuiz } from "@/lib/actions/quiz";
import { cn } from "@/lib/utils";
import { isMediaUrl } from "@/lib/media";

type Quiz = {
  id: string;
  title: string;
  coverIcon: string;
  theme: string;
  coverImage?: string | null;
  iconImage?: string | null;
  questionCount: number;
  updatedAt: string;
};
const covers: Record<string, string> = {
  grape: "bg-[#e9e2ff]",
  coral: "bg-[#ffe0e9]",
  mint: "bg-[#d7f2e8]",
  sky: "bg-[#deedf9]",
  sun: "bg-[#faedce]",
  lime: "bg-[#e9f4ce]",
};

export function QuizLibrary({ quizzes }: { quizzes: Quiz[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [pending, start] = useTransition();
  const [copying, setCopying] = useState<string>();
  const [error, setError] = useState("");
  const filtered = quizzes
    .filter((q) => q.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  function copy(id: string) {
    setCopying(id);
    setError("");
    start(async () => {
      try {
        router.push(`/build/${await duplicateQuiz(id)}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Couldn’t duplicate this quiz.",
        );
      }
    });
  }
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-xl font-bold">
          Your collection{" "}
          <span className="ml-2 rounded-full bg-grape/10 px-2.5 py-1 text-sm text-grape">
            {quizzes.length}
          </span>
        </h2>
        <div className="flex w-full gap-2 sm:w-auto">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-ink/20 bg-white px-3 py-2">
            <Search className="size-4 shrink-0 text-ink-soft" />
            <input
              type="search"
              aria-label="Search quizzes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quizzes…"
              className="w-full min-w-0 bg-transparent text-sm outline-none"
            />
          </label>
          <select
            aria-label="Sort quizzes"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-ink/20 bg-white px-3 text-sm"
          >
            <option value="recent">Recent first</option>
            <option value="name">A → Z</option>
          </select>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-grape-dark">
          {error}
        </p>
      )}
      {!filtered.length ? (
        <div className="mt-6 rounded-3xl border border-dashed border-ink/25 bg-white/50 p-10 text-center">
          <QuizBuddy className="mx-auto w-32" />
          <h3 className="mt-3 font-display text-xl font-bold">
            {quizzes.length
              ? "No matching quizzes."
              : "Your next great quiz starts here."}
          </h3>
          <p className="mt-2 text-sm text-ink-soft">
            {quizzes.length
              ? "Try searching for a different title."
              : "An icebreaker, a friendly rivalry, a campus classic. What will you make?"}
          </p>
          {!quizzes.length && (
            <Link
              href="/create"
              className="mt-5 inline-flex items-center gap-2 font-bold text-grape"
            >
              Create your first quiz
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((q) => {
            const Icon = coverIcon(q.coverIcon);
            return (
              <article
                key={q.id}
                className="group overflow-hidden rounded-3xl border border-ink/15 bg-white transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-[0_10px_30px_#201c3510]"
              >
                <Link
                  href={`/build/${q.id}`}
                  className={cn(
                    "relative flex h-32 items-center justify-center overflow-hidden border-b border-ink/10",
                    covers[q.theme] ?? covers.grape,
                  )}
                >
                  {q.coverImage && isMediaUrl(q.coverImage) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={q.coverImage}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="absolute -right-5 -top-8 size-32 rounded-full border-[22px] border-white/35" />
                  )}
                  {q.iconImage && isMediaUrl(q.iconImage) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={q.iconImage}
                      alt=""
                      loading="lazy"
                      className="relative size-16 rounded-2xl border-2 border-ink bg-white object-cover shadow-pop"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Icon className="relative size-13 rounded-xl bg-white/70 p-2 text-ink transition-transform group-hover:-rotate-6 group-hover:scale-110" />
                  )}
                  <span className="absolute bottom-3 left-4 rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                    {q.questionCount}{" "}
                    {q.questionCount === 1 ? "question" : "questions"}
                  </span>
                </Link>
                <div className="p-5">
                  <h3 className="truncate font-display text-xl font-bold">
                    {q.title}
                  </h3>
                  <p className="mt-1 text-xs text-ink-soft">
                    Updated{" "}
                    {new Date(q.updatedAt).toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </p>
                  <div className="mt-5 flex gap-2">
                    <Link
                      href={`/build/${q.id}`}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ink/20 py-2.5 text-sm font-bold hover:bg-paper-2"
                    >
                      <Pencil className="size-4" />
                      Edit
                    </Link>
                    <Link
                      href={`/present/${q.id}`}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-grape py-2.5 text-sm font-bold text-white hover:bg-grape-dark"
                    >
                      <Play className="size-4" />
                      Launch
                    </Link>
                    <button
                      disabled={pending}
                      onClick={() => copy(q.id)}
                      aria-label={`Duplicate ${q.title}`}
                      className="rounded-xl border border-ink/20 px-3 hover:bg-paper-2 disabled:opacity-50"
                    >
                      {pending && copying === q.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </button>
                  </div>
                  <div className="mt-3">
                    <DeleteQuiz quizId={q.id} title={q.title} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
