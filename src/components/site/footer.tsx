import { Logo } from "@/components/site/logo";

export function Footer() {
  return (
    <footer className="mt-auto border-t-2 border-ink/10 bg-paper-2">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
        <Logo className="h-7" />
        <p className="text-sm text-ink-soft">Free and open source.</p>
        <a
          href="https://github.com/sidd190/quizza"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
