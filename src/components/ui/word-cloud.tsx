/** Deterministic layout and font sizes keep clouds cheap to render on phones. */
export function WordCloud({ values }: { values: string[] }) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values)
    for (const entry of value.split(/[,\n]/)) {
      const label = entry.trim();
      if (!label) continue;
      const key = label.toLocaleLowerCase();
      const word = counts.get(key);
      counts.set(key, {
        label: word?.label ?? label,
        count: (word?.count ?? 0) + 1,
      });
    }
  const words = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
  const max = words[0]?.count ?? 1;
  const colors = ["text-grape", "text-ink", "text-grape-dark", "text-ink-soft"];
  return (
    <div className="mt-4 flex min-h-32 flex-wrap items-center justify-center gap-x-5 gap-y-3 rounded-2xl bg-grape/5 p-6">
      {words.length ? (
        words.slice(0, 100).map((word, i) => (
          <span
            key={word.label}
            title={`${word.count} ${word.count === 1 ? "response" : "responses"}`}
            aria-label={`${word.label}: ${word.count} responses`}
            className={`font-display font-bold ${colors[i % colors.length]}`}
            style={{ fontSize: `${16 + (24 * word.count) / max}px` }}
          >
            {word.label}
          </span>
        ))
      ) : (
        <p className="text-sm text-ink-soft">
          The room is still finding its words.
        </p>
      )}
    </div>
  );
}
