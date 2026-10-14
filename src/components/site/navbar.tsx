import Link from "next/link";
import { GithubIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/logo";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-ink/10 bg-paper/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-8 w-auto" />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="https://github.com/USAR-FOSS/Quizza"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink sm:flex"
          >
            <GithubIcon className="size-4" />
            GitHub
          </a>
          <Button href="/create" variant="primary" size="sm">
            Create a quiz
          </Button>
        </div>
      </nav>
    </header>
  );
}
