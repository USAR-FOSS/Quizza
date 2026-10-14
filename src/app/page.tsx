import {
  Vote,
  Cloud,
  Sliders,
  Trophy,
  CalendarClock,
  Lock,
} from "lucide-react";
import { GithubIcon } from "@/components/ui/icons";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { JoinCard } from "@/components/landing/join-card";
import { Floaties } from "@/components/landing/floaties";

const features = [
  {
    icon: Vote,
    color: "bg-grape",
    title: "Live multiple choice",
    body: "Ask a question, watch votes arrive in real time, and reveal the answer when you are ready.",
  },
  {
    icon: Cloud,
    color: "bg-sky",
    title: "Word clouds",
    body: "Collect short open responses. Common answers grow larger in the live cloud.",
  },
  {
    icon: Sliders,
    color: "bg-mint",
    title: "Scales and polls",
    body: "Gauge opinion with rating scales and polls. No correct answer required.",
  },
  {
    icon: Trophy,
    color: "bg-sun",
    title: "Scoring and leaderboards",
    body: "Points reward speed and accuracy, with a live leaderboard to track standings.",
  },
  {
    icon: CalendarClock,
    color: "bg-coral",
    title: "Live or scheduled",
    body: "Run a quiz live with everyone in sync, or open it for a set window so people take it on their own time.",
  },
  {
    icon: Lock,
    color: "bg-lime",
    title: "Anonymous by default",
    body: "Players join with a nickname. No accounts, no tracking. Sign-in is optional.",
  },
];

const steps = [
  { n: "1", title: "Build it", body: "Create a quiz and add your questions." },
  { n: "2", title: "Share the code", body: "Put the room code on screen. People join from any phone." },
  { n: "3", title: "Play together", body: "Run it live or scheduled, then review the results." },
];

export default function Home() {
  return (
    <>
      <Navbar />

      {/* hero */}
      <section className="relative overflow-hidden bg-dots">
        <Floaties />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center rounded-full border-2 border-ink bg-sun/90 px-3 py-1 font-display text-xs font-bold uppercase tracking-widest text-ink shadow-pop">
              Open-source Mentimeter alternative
            </span>

            <h1 className="mt-5 font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              Play live quizzes,{" "}
              <span className="relative whitespace-nowrap text-grape">
                together
                <svg
                  aria-hidden
                  viewBox="0 0 300 20"
                  className="absolute -bottom-2 left-0 w-full"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M3 14 C 80 4, 220 4, 297 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    className="text-lime"
                  />
                </svg>
              </span>
            </h1>

            <p className="mt-6 max-w-md text-lg text-ink-soft">
              Build a quiz in minutes, share a room code, and let everyone play
              from their phones. No logins required.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/create" variant="primary" size="lg">
                Create a quiz
              </Button>
              <Button
                href="https://github.com/sidd190/quizza"
                variant="outline"
                size="lg"
              >
                <GithubIcon className="size-5" />
                View on GitHub
              </Button>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <JoinCard />
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Three steps, no setup
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="h-full rounded-3xl border-2 border-ink bg-paper p-6 shadow-pop">
                <div className="flex size-12 items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display text-xl font-extrabold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-ink">
                  {s.title}
                </h3>
                <p className="mt-1.5 text-ink-soft">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="bg-paper-2 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <Reveal>
            <h2 className="max-w-2xl font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Everything you need to run a session
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.08}>
                <div className="group h-full rounded-3xl border-2 border-ink bg-paper p-6 shadow-pop transition-transform duration-200 hover:-translate-y-1">
                  <div
                    className={`flex size-12 items-center justify-center rounded-2xl border-2 border-ink text-white ${f.color}`}
                  >
                    <f.icon className="size-6" />
                  </div>
                  <h3 className="mt-4 font-display text-xl font-bold text-ink">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-ink-soft">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* foss cta */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] border-2 border-ink bg-grape p-10 text-center shadow-pop-lg sm:p-16">
            <div className="absolute inset-0 bg-dots opacity-20" />
            <div className="relative">
              <h2 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                Yours to run, forever
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
                quizza is free and open source. Self-host it, fork it, and make
                it your own. Sign-in via fossclub.tech is on the way.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button href="/create" variant="lime" size="lg">
                  Make your first quiz
                </Button>
                <Button
                  href="https://github.com/sidd190/quizza"
                  variant="outline"
                  size="lg"
                >
                  <GithubIcon className="size-5" />
                  Read the code
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <Footer />
    </>
  );
}
