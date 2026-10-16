import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { ArrowUpRight, Plus, Shapes, Radio, Trophy } from "lucide-react";
import { db } from "@/lib/db";
import { quizzes, sessions } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { QuizLibrary } from "@/components/dashboard/quiz-library";
import { QuizBuddy } from "@/components/ui/quiz-buddy";
import { EndSession } from "@/components/dashboard/end-session";
import { formatJoinCode } from "@/lib/codes";
import { UserMenu } from "@/components/site/user-menu";

export const metadata = { title: "Your quiz corner · Quizza" };

async function Inner() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const [rows, recentSessions] = await Promise.all([
    db.query.quizzes.findMany({
      where: eq(quizzes.ownerId, user.id),
      orderBy: desc(quizzes.updatedAt),
      with: { questions: { columns: { id: true } } },
    }),
    db
      .select({
        id: sessions.id,
        code: sessions.code,
        mode: sessions.mode,
        status: sessions.status,
        active: sql<boolean>`${sessions.status} <> 'ended' AND (${sessions.closesAt} IS NULL OR ${sessions.closesAt} > now())`,
        title: quizzes.title,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .innerJoin(quizzes, eq(sessions.quizId, quizzes.id))
      .where(eq(quizzes.ownerId, user.id))
      .orderBy(desc(sessions.createdAt))
      .limit(8),
  ]);
  const firstName = user.name?.split(" ")[0] || "friend";
  const active = (s: (typeof recentSessions)[number]) => s.active;
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-ink-soft">
          Signed in as {user.email || user.name}
        </p>
        <UserMenu name={user.name || user.email || "Host"} color="grape" />
      </div>
      <section className="relative overflow-hidden rounded-[2rem] border border-ink/15 bg-[#e9e2f7] px-6 py-8 sm:p-9">
        <div className="relative z-10 max-w-lg">
          <p className="eyebrow text-grape">Your quiz corner</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-.045em] sm:text-4xl">
            Hey {firstName}, what’s the big question?
          </h1>
          <p className="mt-3 max-w-sm text-ink-soft">
            A fresh idea or an old crowd favorite. Get your people playing.
          </p>
          <Link
            href="/create"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border-2 border-ink bg-grape px-5 py-3 font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5"
          >
            <Plus className="size-4" />
            Make a new quiz
          </Link>
        </div>
        <QuizBuddy className="absolute -bottom-3 right-3 hidden w-52 rotate-6 lg:block" />
      </section>
      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-5">
        {[
          { icon: Shapes, value: rows.length, label: "Quizzes made" },
          {
            icon: Radio,
            value: recentSessions.filter(active).length,
            label: "Active in recent runs",
          },
          {
            icon: Trophy,
            value: rows.reduce((total, q) => total + q.questions.length, 0),
            label: "Good questions",
          },
        ].map(({ icon: Icon, value, label }) => (
          <div
            key={label}
            className="rounded-2xl border border-ink/10 bg-white/70 p-4 sm:p-5"
          >
            <Icon className="size-5 text-grape" />
            <p className="mt-3 font-display text-3xl font-extrabold tabular-nums">
              {value}
            </p>
            <p className="mt-1 text-xs text-ink-soft sm:text-sm">{label}</p>
          </div>
        ))}
      </div>
      <QuizLibrary
        quizzes={rows.map((q) => ({
          id: q.id,
          title: q.title,
          coverIcon: q.coverIcon,
          theme: q.theme,
          coverImage: q.settings.coverImage,
          iconImage: q.settings.iconImage,
          questionCount: q.questions.length,
          updatedAt: q.updatedAt.toISOString(),
        }))}
      />
      {recentSessions.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold">Recently played</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Pick up an active room, revisit the results, or download your data.
          </p>
          <div className="mt-5 divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/15 bg-white/70">
            {recentSessions.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 p-5"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-display font-bold">{s.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${active(s) ? "bg-mint/20" : "bg-ink/5"}`}
                    >
                      {active(s)
                        ? s.mode === "live"
                          ? "Live room"
                          : "Scheduled window"
                        : "Finished"}
                    </span>
                    <span className="font-mono">{formatJoinCode(s.code)}</span>
                    <span>
                      {s.createdAt.toLocaleDateString("en", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {active(s) && s.mode === "live" && (
                    <Link
                      href={`/host/${s.code}`}
                      className="text-sm font-bold text-grape"
                    >
                      Resume hosting
                    </Link>
                  )}
                  <Link
                    href={`/results/${s.code}`}
                    className="inline-flex items-center gap-1 text-sm font-bold"
                  >
                    Results
                    <ArrowUpRight className="size-4" />
                  </Link>
                  {active(s) && <EndSession code={s.code} />}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <main className="page-enter mx-auto w-full max-w-6xl flex-1 px-5 py-9 sm:px-8">
        <Suspense fallback={<DashboardSkeleton />}>
          <Inner />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading your quiz collection">
      <div className="skeleton h-64 rounded-[2rem]" />
      <div className="mt-6 grid grid-cols-3 gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-32 rounded-2xl" />
        ))}
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-64 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
