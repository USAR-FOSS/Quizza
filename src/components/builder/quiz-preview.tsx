"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Clock, RotateCcw } from "lucide-react";
import { Logo } from "@/components/site/logo";
import { QuestionMedia } from "@/components/ui/question-media";
import { QuizBuddy } from "@/components/ui/quiz-buddy";
import { Button } from "@/components/ui/button";
import { QUESTION_TYPES } from "@/lib/quiz-constants";
import type {
  QuizWithQuestions,
  QuestionWithOptions,
} from "@/lib/db/schema-types";
import { cn } from "@/lib/utils";
import { RoomTheme } from "@/components/live/room-theme";

export function QuizPreview({ quiz }: { quiz: QuizWithQuestions }) {
  const [index, setIndex] = useState(0);
  const question = quiz.questions[index];
  return (
    <RoomTheme
      theme={quiz.theme}
      className="flex min-h-screen flex-col bg-paper bg-dots"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-paper px-5 py-4">
        <Link href="/">
          <Logo />
        </Link>
        <span className="rounded-full bg-lime/60 px-3 py-1 text-xs font-bold">
          PARTICIPANT PREVIEW
        </span>
        <Link
          href={`/build/${quiz.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-bold"
        >
          <ArrowLeft className="size-4" />
          Back to editor
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-10">
        <p className="mb-6 text-center text-xs text-ink-soft">
          {quiz.title} · Practice only. Timers are paused and answers aren’t
          saved.
        </p>
        {question ? (
          <>
            <div className="mb-5 flex items-center justify-between text-xs font-semibold text-ink-soft">
              <span>
                Question {index + 1} of {quiz.questions.length}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                {question.timeLimitSec}s in play
              </span>
            </div>
            <PreviewQuestion key={question.id} question={question} />
            <div className="mt-8 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ArrowLeft className="size-4" />
                Previous
              </Button>
              <Button onClick={() => setIndex(index + 1)}>
                {index + 1 === quiz.questions.length
                  ? "Finish preview"
                  : "Next question"}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-3xl border-2 border-ink bg-paper p-8 text-center shadow-pop">
            <QuizBuddy className="mx-auto w-36" />
            <h1 className="mt-4 font-display text-3xl font-extrabold">
              {quiz.questions.length
                ? "That’s your quiz!"
                : "A blank canvas, for now."}
            </h1>
            <p className="mt-3 text-ink-soft">
              {quiz.questions.length
                ? "Head back to fine-tune it, or give it another spin."
                : "Add some questions in the editor, then come back for a test drive."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button href={`/build/${quiz.id}`}>Back to editor</Button>
              {quiz.questions.length > 0 && (
                <Button variant="outline" onClick={() => setIndex(0)}>
                  <RotateCcw className="size-4" />
                  Try again
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </RoomTheme>
  );
}

function PreviewQuestion({ question: q }: { question: QuestionWithOptions }) {
  const [chosen, setChosen] = useState<string>();
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const meta = QUESTION_TYPES[q.type];
  return (
    <section className="page-enter rounded-3xl border-2 border-ink bg-paper p-6 shadow-pop sm:p-8">
      <p className="eyebrow text-grape">{meta.label}</p>
      <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight">
        {q.prompt || "Your question goes here…"}
      </h1>
      <QuestionMedia url={q.mediaUrl} />
      {q.options.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {q.options.map((option) => (
            <button
              key={option.id}
              onClick={() => setChosen(option.id)}
              disabled={Boolean(chosen)}
              className={cn(
                "flex min-h-16 items-center justify-between gap-2 rounded-2xl border-2 p-4 text-left font-display font-bold transition-colors",
                chosen && option.isCorrect && meta.scorable
                  ? "border-ink bg-mint/25"
                  : chosen === option.id
                    ? "border-ink bg-grape/15"
                    : "border-ink/20 bg-paper-2",
              )}
            >
              <span>{option.label || "Answer option…"}</span>
              {chosen && option.isCorrect && meta.scorable && (
                <Check className="size-5 shrink-0" />
              )}
            </button>
          ))}
        </div>
      ) : q.type === "scale" ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {Array.from(
            {
              length:
                (q.settings.scaleMax ?? 5) - (q.settings.scaleMin ?? 1) + 1,
            },
            (_, i) => i + (q.settings.scaleMin ?? 1),
          ).map((n) => (
            <button
              key={n}
              disabled={Boolean(chosen)}
              onClick={() => setChosen(String(n))}
              className={cn(
                "size-12 rounded-xl border-2 font-display font-bold",
                chosen === String(n)
                  ? "border-ink bg-lime"
                  : "border-ink/20 bg-paper-2",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <input
            aria-label="Your answer"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type your answer…"
            disabled={submitted}
            className="w-full rounded-xl border-2 border-ink/20 bg-paper-2 px-4 py-3"
          />
          <Button
            className="mt-3 w-full"
            type="submit"
            disabled={!text.trim() || submitted}
          >
            Submit response
          </Button>
        </form>
      )}
      {(chosen || submitted) && (
        <p
          role="status"
          className="page-enter mt-5 rounded-xl bg-grape/10 p-3 text-center text-sm font-semibold"
        >
          {meta.scorable && chosen
            ? q.options.find((option) => option.id === chosen)?.isCorrect
              ? "Correct"
              : "Incorrect"
            : "Answer saved"}
        </p>
      )}
    </section>
  );
}
