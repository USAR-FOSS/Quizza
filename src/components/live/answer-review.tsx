import type { Results } from "@/lib/api-client";
import { QuestionMedia } from "@/components/ui/question-media";

/** Policy-gated end-of-game answer key shared by live and scheduled play. */
export function AnswerReview({ results }: { results: Results | null }) {
  if (!results?.showAnswers || !results.questionStats.length) return null;
  const scored = results.questionStats.filter((question) =>
    question.options.some((option) => option.isCorrect),
  );
  if (!scored.length) return null;
  return (
    <section className="mt-6 text-left" aria-label="Answer review">
      <h2 className="font-display text-lg font-extrabold">Answer review</h2>
      <ol className="mt-2 space-y-2">
        {scored.map((question, index) => (
          <li key={question.questionId} className="rounded-xl border border-ink/15 bg-white/70 p-3 text-sm">
            <p className="font-semibold">{index + 1}. {question.prompt}</p>
            <QuestionMedia url={question.mediaUrl} />
            <p className="mt-1 text-ink-soft">Answer: <strong className="text-ink">{question.options.filter((option) => option.isCorrect).map((option) => option.label).join(", ")}</strong></p>
          </li>
        ))}
      </ol>
    </section>
  );
}
