"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { loginAction, registerAction } from "@/lib/actions/auth";
import { GithubIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { QuizBuddy } from "@/components/ui/quiz-buddy";

const ERROR_TEXT: Record<string, string> = {
  oidc_unavailable: "FOSSClub sign-in is not configured on this instance.",
  oidc_state: "Sign-in could not be verified. Please try again.",
  oidc_nonce: "Sign-in could not be verified. Please try again.",
  oidc_token: "FOSSClub did not accept the sign-in. Please try again.",
  oidc_verify: "Could not verify the FOSSClub token.",
  oidc_error: "Something went wrong completing sign-in. Please try again.",
};

export function AuthForm({
  initialError,
  next,
  oidcAvailable = false,
}: {
  initialError?: string;
  next?: string;
  oidcAvailable?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(
    initialError ? (ERROR_TEXT[initialError] ?? "Sign-in failed.") : "",
  );
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      try {
        const res =
          mode === "signin"
            ? await loginAction({ email, password })
            : await registerAction({ email, password, name });
        if ("error" in res) {
          setError(res.error);
        } else {
          router.push(next ?? "/dashboard");
          router.refresh();
        }
      } catch {
        setError("Couldn’t reach the server. Please try again.");
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md rounded-3xl border-2 border-ink bg-paper p-7 shadow-pop-lg"
    >
      <div className="mb-6 flex items-center gap-3">
        <QuizBuddy className="w-20 shrink-0" />
        <div>
          <p className="eyebrow text-grape">Host account</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
        </div>
      </div>
      <div className="flex rounded-2xl border-2 border-ink bg-paper-2 p-1">
        {(["signin", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-xl py-2 font-display text-sm font-bold transition-colors",
              mode === m ? "bg-grape text-white" : "text-ink-soft",
            )}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        {mode === "register" && (
          <input
            aria-label="Name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            maxLength={80}
            className="w-full rounded-2xl border-2 border-ink bg-paper-2 px-4 py-3 font-semibold text-ink placeholder:text-ink-soft/50 focus:bg-white focus:outline-none"
          />
        )}
        <input
          type="email"
          aria-label="Email address"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-2xl border-2 border-ink bg-paper-2 px-4 py-3 font-semibold text-ink placeholder:text-ink-soft/50 focus:bg-white focus:outline-none"
        />
        <input
          type="password"
          aria-label="Password"
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          minLength={mode === "register" ? 8 : 1}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={
            mode === "register" ? "Password (8+ characters)" : "Password"
          }
          className="w-full rounded-2xl border-2 border-ink bg-paper-2 px-4 py-3 font-semibold text-ink placeholder:text-ink-soft/50 focus:bg-white focus:outline-none"
        />

        {error && (
          <p className="rounded-xl border-2 border-coral bg-coral/10 p-3 text-center text-sm font-semibold text-ink">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center rounded-2xl border-2 border-ink bg-grape font-display font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {pending
            ? "Please wait"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      {oidcAvailable && (
        <>
          <div className="my-5 flex items-center gap-3 text-sm text-ink-soft">
            <span className="h-px flex-1 bg-ink/15" />
            or
            <span className="h-px flex-1 bg-ink/15" />
          </div>
          <a
            href="/api/v1/auth/oidc/start"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-paper font-display font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
          >
            <GithubIcon className="size-5" />
            Continue with FOSSClub
          </a>
        </>
      )}
      <p className="mt-5 text-center text-xs leading-relaxed text-ink-soft">
        Here to play? Most quizzes just need a room code and a nickname.
      </p>
    </motion.div>
  );
}
