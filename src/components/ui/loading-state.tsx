import { QuizBuddy } from "@/components/ui/quiz-buddy";

export function LoadingState({
  label = "Loading…",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center px-6 py-12 text-center"
    >
      <QuizBuddy className="w-32" mood="thinking" />
      <p className="mt-3 font-display font-bold text-ink-soft">{label}</p>
      <div aria-hidden="true" className="mt-4 flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="loading-dot size-2 rounded-full bg-grape"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
