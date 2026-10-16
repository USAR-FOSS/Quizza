import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Radio,
  CalendarClock,
  Zap,
  Trophy,
  MousePointer2,
  Shapes,
  Heart,
  Sparkles,
} from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { JoinCard } from "@/components/landing/join-card";
import { QuizBuddy } from "@/components/ui/quiz-buddy";

const steps = [
  {
    title: "A spark of curiosity.",
    text: "Mix six question types, add your media, and make it your own.",
    color: "bg-[#e9e2ff]",
    icon: Shapes,
  },
  {
    title: "One code. Everyone in.",
    text: "Share a room code. Players pick a nickname and join from any phone.",
    color: "bg-[#e9f4ce]",
    icon: MousePointer2,
  },
  {
    title: "Let the good guesses roll.",
    text: "Play, reveal, celebrate. Take the results with you when you’re done.",
    color: "bg-[#ffe7d9]",
    icon: Trophy,
  },
];

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <section className="relative overflow-hidden border-b border-ink/10">
          <div className="hero-grid pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pb-24">
            <div className="relative z-10">
              <span className="eyebrow">
                <span className="size-2 rounded-full bg-grape" />A little
                curiosity. A lot of connection.
              </span>
              <h1 className="mt-6 max-w-xl font-display text-[clamp(3.1rem,5.8vw,5.2rem)] font-extrabold leading-[.98] tracking-[-.065em]">
                Big questions.
                <br />
                Better{" "}
                <span className="relative inline-block text-grape">
                  together.
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 400 24"
                    className="absolute -bottom-3 left-0 w-full"
                  >
                    <path
                      d="M5 16Q180 0 394 12"
                      stroke="#C2DD66"
                      strokeWidth="8"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </span>
              </h1>
              <p className="mt-8 max-w-[29rem] text-lg leading-relaxed text-ink-soft">
                Turn a room full of people into a room full of{" "}
                <span className="font-semibold text-ink">
                  “ooh, I know this one.”
                </span>{" "}
                Create a quiz, share a code, and find your next great moment.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button href="/create" size="lg">
                  Make a quiz <ArrowUpRight className="size-5" />
                </Button>
                <Button href="/demo" variant="outline" size="lg">
                  Take a little test drive
                </Button>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-ink-soft">
                {[
                  "Free & open source",
                  "No player accounts",
                  "Made for your people",
                ].map((text) => (
                  <span key={text} className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-grape" strokeWidth={3} />
                    {text}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md lg:pt-14">
              <div className="absolute -right-4 -top-19 z-10 hidden rotate-6 items-center gap-2 rounded-xl border-2 border-ink bg-lime px-4 py-2 font-display text-sm font-bold shadow-pop sm:flex lg:-top-5">
                <Sparkles className="size-4" />
                Good times, zero downloads.
              </div>
              <div id="join-room" className="relative z-10">
                <JoinCard />
              </div>
              <div className="relative z-20 -mt-1 flex items-center justify-center gap-1 sm:-ml-12 sm:justify-start">
                <QuizBuddy className="w-36 -rotate-6 sm:w-40" />
                <div className="-ml-4 -rotate-6 font-display text-sm font-bold text-ink-soft">
                  Meet Quip.
                  <br />
                  <span className="font-normal">
                    Your curious little sidekick.
                  </span>
                </div>
              </div>
              <div className="absolute inset-8 -rotate-6 rounded-[2rem] bg-[#e8e1f7]" />
            </div>
          </div>
        </section>
        <div className="border-b border-ink/10 bg-[#eae5f3]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-9 gap-y-3 px-5 py-5 text-xs font-bold tracking-wide text-ink-soft sm:text-sm">
            <span className="text-ink">A place for every “what if?”</span>
            <span>Campus clubs</span>
            <span>Classroom aha!s</span>
            <span>Team brain breaks</span>
            <span>Friendly rivalries</span>
          </div>
        </div>
        <section
          id="how-it-works"
          className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24"
        >
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-grape">Less setup. More showing up.</p>
              <h2 className="mt-3 font-display text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">
                From idea to “I’m in.”
              </h2>
            </div>
            <ArrowDown className="hidden size-9 -rotate-45 text-grape sm:block" />
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.08}>
                <article className="group h-full rounded-3xl border border-ink/15 bg-white/50 p-6 transition-colors hover:bg-white">
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex size-13 items-center justify-center rounded-2xl border border-ink/15 ${step.color}`}
                    >
                      <step.icon className="size-6" />
                    </span>
                    <span className="font-mono text-sm text-ink-soft/60">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-8 font-display text-xl font-bold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-ink-soft">
                    {step.text}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 sm:pb-24">
          <Reveal>
            <p className="eyebrow text-grape">Your room. Your rhythm.</p>
            <h2 className="mt-3 max-w-xl font-display text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">
              A quiz for the moment
              <br />
              you have in mind.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Reveal>
              <article className="relative h-full overflow-hidden rounded-[2rem] border-2 border-ink bg-[#e7e0fc] p-7 sm:p-9">
                <span className="eyebrow">
                  <Radio className="size-4" />
                  All eyes on the big screen
                </span>
                <h3 className="mt-5 font-display text-3xl font-extrabold tracking-tight">
                  Bring the room to life.
                </h3>
                <p className="mt-3 max-w-xs leading-relaxed text-ink-soft">
                  One host, everyone in sync. Live answers, dramatic reveals,
                  and a leaderboard worth cheering for.
                </p>
                <div
                  aria-hidden="true"
                  className="mt-9 space-y-2 rounded-2xl border-2 border-ink bg-paper p-4 shadow-pop"
                >
                  <div className="flex items-center gap-3 rounded-xl bg-lime/45 px-3 py-3">
                    <Trophy className="size-5" />
                    <span className="flex-1 font-display font-bold">
                      The happy guessers
                    </span>
                    <span className="font-mono text-sm font-bold">2,400</span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <span className="text-sm">02</span>
                    <span className="flex-1 text-sm font-semibold">
                      Quiz on my face
                    </span>
                    <span className="font-mono text-sm">2,100</span>
                  </div>
                </div>
              </article>
            </Reveal>
            <Reveal delay={0.1}>
              <article className="h-full rounded-[2rem] border-2 border-ink bg-[#eaf0d9] p-7 sm:p-9">
                <span className="eyebrow">
                  <CalendarClock className="size-4" />
                  Different schedules, same spark
                </span>
                <h3 className="mt-5 font-display text-3xl font-extrabold tracking-tight">
                  Give curiosity some time.
                </h3>
                <p className="mt-3 max-w-xs leading-relaxed text-ink-soft">
                  Set an opening and closing time. Let people take your quiz at
                  their own pace, wherever they are.
                </p>
                <div
                  aria-hidden="true"
                  className="mt-9 rounded-2xl border-2 border-ink bg-paper p-5 shadow-pop"
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Ready when you are</span>
                    <span className="rounded-full bg-mint/20 px-3 py-1 text-xs">
                      Open now
                    </span>
                  </div>
                  <div className="mt-5 flex gap-2">
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <div
                        key={n}
                        className={`h-3 flex-1 rounded-full ${n < 5 ? "bg-grape" : "bg-ink/10"}`}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-ink-soft">
                    A few good questions. Your own little moment.
                  </p>
                </div>
              </article>
            </Reveal>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              {
                Icon: Shapes,
                title: "Six ways to ask",
                body: "Choices, polls, word clouds & more.",
              },
              {
                Icon: Zap,
                title: "A playful little twist",
                body: "Optional boosts and safety shields.",
              },
              {
                Icon: Heart,
                title: "Yours to make your own",
                body: "Open source. Ready to self-host.",
              },
            ].map(({ Icon, title, body }) => (
              <div
                key={title}
                className="flex gap-3 rounded-2xl border border-ink/10 p-5"
              >
                <Icon className="mt-1 size-5 shrink-0 text-grape" />
                <div>
                  <h3 className="font-display font-bold">{title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] bg-ink px-7 py-12 text-paper sm:px-14 sm:py-16">
              <div className="relative z-10 max-w-xl">
                <p className="eyebrow text-lime">Made for people, by people</p>
                <h2 className="mt-4 font-display text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">
                  Good questions deserve
                  <br />a good home.
                </h2>
                <p className="mt-4 max-w-md leading-relaxed text-paper/70">
                  Born for campus clubs. Open to everyone. Quizza is a little
                  corner of the internet for learning, laughing, and playing
                  together.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-5">
                  <Button href="/create" variant="lime">
                    Let’s make something fun <ArrowRight className="size-4" />
                  </Button>
                  <Link
                    href="https://github.com/USAR-FOSS/Quizza"
                    className="text-sm font-semibold text-paper/80 underline underline-offset-4"
                  >
                    Explore the source
                  </Link>
                </div>
              </div>
              <QuizBuddy className="absolute -bottom-5 -right-10 hidden w-72 rotate-12 opacity-90 lg:block" />
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </>
  );
}
