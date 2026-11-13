# Contributing a room theme

[Contributing](../../CONTRIBUTING.md) → [Documentation map](../README.md) → Themes

Start with an open theme issue and agree on a distinct palette. The current
palette names and stable keys are already stored in quiz records; preserve them.

## Files to change

| File | Responsibility |
| --- | --- |
| `src/lib/quiz-constants.ts` | `THEMES`: key, name, picker swatch |
| `src/components/live/room-theme.tsx` | Room accent, paper, and surface colors |
| `src/app/globals.css` | Global tokens and literal utilities, when a new swatch needs them |

Keep Tailwind utility names literal so production builds detect them. Keep the
scope to the new palette and necessary picker wiring. A new theme should not
change scoring, data shape, or unrelated colors.

## Acceptance checklist

- Give the theme a readable name and a stable key.
- Check text and focus contrast with a contrast checker, including disabled and
  selected states. Meet WCAG AA text contrast for the intended usage.
- Preserve non-color cues for correctness, selection, and status.
- Check picker, quiz preview, host lobby, player question, reveal, and results.
- Check a narrow mobile viewport, long prompts, keyboard focus, and reduced motion.
- Include screenshots and observed checks in the PR.

Follow the [development setup](../development.md) and run lint, typecheck, and a
production build to catch missing utilities. A visual palette does not need a
new unit test that merely repeats its color values.
