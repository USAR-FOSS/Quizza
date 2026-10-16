import { QuizBuddy } from "@/components/ui/quiz-buddy";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="page-enter mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <QuizBuddy mood="thinking" />
      <p className="eyebrow mt-4 text-grape">404 · A real head-scratcher</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">
        This one has us stumped.
      </h1>
      <p className="mb-7 mt-3 text-ink-soft">
        This page may have moved, or the link took a wrong turn. Let’s get you
        back to the good stuff.
      </p>
      <Button href="/">Back to Quizza</Button>
    </main>
  );
}
