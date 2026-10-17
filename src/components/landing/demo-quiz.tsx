"use client";

import { useState } from "react";
import { ArrowRight, Check, RotateCcw, Trophy } from "lucide-react";
import { QuizBuddy } from "@/components/ui/quiz-buddy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const questions = [
  {
    prompt: "Which of these is actually a berry?",
    options: ["Strawberry", "Banana", "Raspberry", "Blackberry"],
    correct: 1,
    fact: "Botanically, bananas are berries; strawberries are not.",
  },
  {
    prompt: "An octopus has how many hearts?",
    options: ["One", "Two", "Three", "Eight"],
    correct: 2,
    fact: "Two pump blood to the gills; one serves the body.",
  },
  {
    prompt: "What does the first F in FOSS stand for?",
    options: ["Fast", "Friendly", "Fancy", "Free"],
    correct: 3,
    fact: "FOSS means Free and Open Source Software.",
  },
];
const colors = ["bg-[#e9e2ff]", "bg-[#e9f4ce]", "bg-[#ffe7d9]", "bg-[#deedf9]"];

export function DemoQuiz() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const q = questions[index];
  function pick(option: number) {
    if (picked !== null) return;
    setPicked(option);
    if (option === q.correct) setScore((score) => score + 1000);
  }
  return (
    <div className="page-enter mx-auto w-full max-w-2xl">
      <div className="mb-7 flex items-center justify-between">
        <span className="eyebrow text-grape">Demo</span>
        <span className="rounded-full border border-ink/15 bg-lime/50 px-3 py-1 font-mono text-sm font-bold">
          {score.toLocaleString()} pts
        </span>
      </div>
      {q ? (
        <section
          key={index}
          className="page-enter rounded-3xl border-2 border-ink bg-paper p-6 shadow-pop-lg sm:p-9"
        >
          <div className="flex items-center justify-between text-xs font-bold text-ink-soft">
            <span>NO ACCOUNT NEEDED</span>
            <span>
              {index + 1} / {questions.length}
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            {questions.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i <= index ? "bg-grape" : "bg-ink/10",
                )}
              />
            ))}
          </div>
          <h1 className="mt-7 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {q.prompt}
          </h1>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {q.options.map((option, i) => (
              <button
                key={option}
                disabled={picked !== null}
                onClick={() => pick(i)}
                className={cn(
                  "flex min-h-20 items-center gap-3 rounded-2xl border-2 border-ink px-4 py-4 text-left font-display text-lg font-bold transition-transform enabled:hover:-translate-y-1",
                  colors[i],
                  picked !== null &&
                    i === q.correct &&
                    "ring-3 ring-grape ring-offset-2",
                  picked !== null && i !== q.correct && "opacity-50",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/70 text-xs">
                  {picked !== null && i === q.correct ? (
                    <Check className="size-4" />
                  ) : (
                    String.fromCharCode(65 + i)
                  )}
                </span>
                {option}
              </button>
            ))}
          </div>
          {picked !== null && (
            <div role="status" className="page-enter mt-6">
              <h2 className="font-display text-xl font-bold">
                {picked === q.correct ? "Correct" : "Incorrect"}
              </h2>
              <p className="mt-2 leading-relaxed text-ink-soft">{q.fact}</p>
              <Button
                onClick={() => {
                  setIndex(index + 1);
                  setPicked(null);
                }}
                className="mt-5 w-full"
              >
                {index === questions.length - 1
                  ? "See results"
                  : "Next question"}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
        </section>
      ) : (
        <section className="page-enter rounded-3xl border-2 border-ink bg-paper p-9 text-center shadow-pop-lg">
          <QuizBuddy className="mx-auto w-40" />
          <span className="eyebrow text-grape">
            <Trophy className="size-4" />
            Demo complete
          </span>
          <h1 className="mt-4 font-display text-4xl font-extrabold">
            {score / 1000} out of 3 correct
          </h1>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button href="/create">
              Create a quiz
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIndex(0);
                setPicked(null);
                setScore(0);
              }}
            >
              <RotateCcw className="size-4" />
              Play again
            </Button>
          </div>
        </section>
      )}
      <p className="mt-6 text-center text-xs text-ink-soft">
        Demo scores aren’t saved.
      </p>
    </div>
  );
}
