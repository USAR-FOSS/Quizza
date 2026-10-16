"use client";
import Link from "next/link";
import { QuizBuddy } from "@/components/ui/quiz-buddy";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="page-enter mx-auto flex min-h-[75vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <QuizBuddy mood="thinking" />
      <p className="eyebrow mt-4 text-grape">A small plot twist</p>
      <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
        That didn’t go to plan.
      </h1>
      <p className="mt-3 text-ink-soft">
        We couldn’t load this page. Give it another go—your next good question
        is still out there.
      </p>
      <div className="mt-7 flex gap-4">
        <button
          onClick={() => retry()}
          className="rounded-xl border-2 border-ink bg-grape px-5 py-3 font-bold text-white shadow-pop"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border-2 border-ink px-5 py-3 font-bold"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
