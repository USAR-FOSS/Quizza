import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";

export function ComingSoon({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <>
      <Navbar />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-dots px-5 py-24">
        <div className="w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-10 text-center shadow-pop-lg">
          <div className="mx-auto flex size-20 items-center justify-center rounded-3xl border-2 border-ink bg-paper-2 animate-float">
            <Icon className="size-9 text-ink" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-3 text-ink-soft">{body}</p>
          <div className="mt-7">
            <Button href="/" variant="outline">
              Back home
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
