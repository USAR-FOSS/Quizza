import Link from "next/link";
import { GithubIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/logo";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-ink/10 bg-paper/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-5">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-8 w-auto" />
          <span className="hidden rounded-full border border-ink/15 bg-lime/60 px-2 py-0.5 text-[10px] font-bold tracking-wide sm:block">
            A GOOD QUESTION
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/#join-room"
            className="rounded-xl px-1 py-2 text-xs font-semibold text-grape sm:px-2 sm:text-sm"
          >
            Join
          </Link>
          <Link
            href="/#how-it-works"
            className="hidden px-3 py-2 text-sm font-semibold text-ink-soft hover:text-grape lg:block"
          >
            How it works
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl px-1 py-2 text-xs font-semibold text-ink-soft transition-colors hover:text-grape sm:px-3 sm:text-sm"
          >
            My quizzes
          </Link>
          <a
            href="https://github.com/USAR-FOSS/Quizza"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink md:flex"
          >
            <GithubIcon className="size-4" />
            GitHub
          </a>
          <Button href="/create" variant="primary" size="sm">
            <span className="sm:hidden">Create</span>
            <span className="hidden sm:inline">Create a quiz</span>
          </Button>
        </div>
      </nav>
    </header>
  );
}
