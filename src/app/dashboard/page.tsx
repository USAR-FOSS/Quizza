import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Loader2, Plus, Pencil, Play } from "lucide-react";
import { db } from "@/lib/db";
import { quizzes } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { coverIcon } from "@/components/ui/quiz-icons";
import { DeleteQuiz } from "@/components/dashboard/delete-quiz";
import { cn } from "@/lib/utils";

export const metadata = { title: "Your quizzes - quizza" };

async function Inner() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await db.query.quizzes.findMany({
    where: eq(quizzes.ownerId, user.id),
    orderBy: desc(quizzes.updatedAt),
    with: { questions: { columns: { id: true } } },
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
            Your quizzes
          </h1>
          <p className="mt-1 text-ink-soft">
            Signed in as {user.name || user.email}
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-ink bg-grape px-5 font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <Plus className="size-5" />
          New quiz
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-3xl border-2 border-dashed border-ink/20 p-12 text-center">
          <p className="font-display text-lg font-bold text-ink">No quizzes yet</p>
          <p className="mt-1 text-ink-soft">Create your first quiz to get started.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((q) => {
            const Icon = coverIcon(q.coverIcon);
            return (
              <div
                key={q.id}
                className="flex flex-col rounded-3xl border-2 border-ink bg-paper p-5 shadow-pop"
              >
                <div
                  className={cn(
                    "flex size-12 items-center justify-center rounded-2xl border-2 border-ink text-white",
                    colorClass(q.theme),
                  )}
                >
                  <Icon className="size-6" />
                </div>
                <h2 className="mt-3 font-display text-lg font-bold text-ink">{q.title}</h2>
                <p className="text-sm text-ink-soft">
                  {q.questions.length} {q.questions.length === 1 ? "question" : "questions"}
                </p>
                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/build/${q.id}`}
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-ink bg-paper font-display text-sm font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                  <Link
                    href={`/present/${q.id}`}
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-ink bg-grape font-display text-sm font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5"
                  >
                    <Play className="size-4" />
                    Launch
                  </Link>
                </div>
                <div className="mt-2">
                  <DeleteQuiz quizId={q.id} title={q.title} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function colorClass(theme: string): string {
  const map: Record<string, string> = {
    grape: "bg-grape",
    coral: "bg-coral",
    mint: "bg-mint",
    sky: "bg-sky",
    sun: "bg-sun",
    lime: "bg-lime",
  };
  return map[theme] ?? "bg-grape";
}

export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
        <Suspense fallback={<Loader2 className="size-8 animate-spin text-grape" />}>
          <Inner />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
