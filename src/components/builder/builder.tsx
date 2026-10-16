"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { Play, Check, Loader2, ListPlus, Settings2, Eye } from "lucide-react";
import { Logo } from "@/components/site/logo";
import { QuestionSidebar } from "@/components/builder/question-sidebar";
import { QuestionEditor } from "@/components/builder/question-editor";
import { QuizMeta } from "@/components/builder/quiz-meta";
import { QuizAppearance } from "@/components/builder/quiz-appearance";
import { QuizSettingsPanel } from "@/components/builder/quiz-settings";
import * as actions from "@/lib/actions/quiz";
import type {
  OptionRow,
  QuestionType,
  QuestionWithOptions,
  QuizSettings,
  QuizWithQuestions,
} from "@/lib/db/schema-types";

type SaveState = "idle" | "saving" | "saved" | "error";

export function Builder({ initial }: { initial: QuizWithQuestions }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizWithQuestions>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.questions[0]?.id ?? null,
  );
  const [save, setSave] = useState<SaveState>("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // per-key debounce timers for text fields
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(new Map<string, () => Promise<unknown>>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const failed = useRef(false);
  const failedKeys = useRef(new Set<string>());
  const latestTasks = useRef(new Map<string, () => Promise<unknown>>());
  const activeSaves = useRef(0);
  const [saveError, setSaveError] = useState("");

  const runSave = useCallback(
    async (fn: () => Promise<unknown>, key = `operation:${Math.random()}`) => {
      latestTasks.current.set(key, fn);
      activeSaves.current++;
      setSave("saving");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      const task = queue.current.catch(() => {}).then(fn);
      queue.current = task;
      try {
        await task;
        failedKeys.current.delete(key);
        failed.current = failedKeys.current.size > 0;
        if (!failed.current) setSaveError("");
        if (
          queue.current === task &&
          pending.current.size === 0 &&
          !failed.current
        ) {
          setSave("saved");
          savedTimer.current = setTimeout(() => setSave("idle"), 1600);
        }
      } catch (err) {
        if (latestTasks.current.get(key) !== fn) return;
        failedKeys.current.add(key);
        failed.current = true;
        setSaveError(
          err instanceof Error
            ? err.message
            : "Couldn’t save. Please retry before leaving.",
        );
        setSave("error");
        pending.current.set(key, fn);
      } finally {
        activeSaves.current--;
      }
    },
    [],
  );

  const debounced = useCallback(
    (key: string, fn: () => Promise<unknown>, delay = 500) => {
      if (timers.current[key]) clearTimeout(timers.current[key]);
      setSave("saving");
      pending.current.set(key, fn);
      latestTasks.current.set(key, fn);
      timers.current[key] = setTimeout(() => {
        pending.current.delete(key);
        void runSave(fn, key);
      }, delay);
    },
    [runSave],
  );

  async function flush() {
    Object.values(timers.current).forEach(clearTimeout);
    const tasks = [...pending.current.entries()];
    pending.current.clear();
    failed.current = false;
    failedKeys.current.clear();
    setSaveError("");
    await Promise.all(tasks.map(([key, fn]) => runSave(fn, key)));
    await queue.current.catch(() => {});
    return !failed.current;
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current.size || failed.current || activeSaves.current)
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /* ---------------- quiz meta ---------------- */

  function patchQuiz(patch: Partial<QuizWithQuestions>) {
    setQuiz((q) => ({ ...q, ...patch }));
    for (const [field, value] of Object.entries(patch))
      debounced(`quiz:${field}`, () =>
        actions.updateQuiz(quiz.id, {
          [field]: value,
        }),
      );
  }

  function patchSettings(patch: Partial<QuizSettings>) {
    const next = { ...quiz.settings, ...patch };
    setQuiz((q) => ({ ...q, settings: next }));
    void runSave(() => actions.updateQuiz(quiz.id, { settings: next }));
  }

  /* ---------------- questions ---------------- */

  function patchQuestions(next: QuestionWithOptions[]) {
    setQuiz((q) => ({ ...q, questions: next }));
  }

  async function addQuestion(type: QuestionType) {
    await runSave(async () => {
      const created = await actions.addQuestion(quiz.id, type);
      patchQuestions([...quiz.questions, created]);
      setSelectedId(created.id);
    });
  }

  function updateQuestion(
    questionId: string,
    patch: Partial<QuestionWithOptions>,
  ) {
    patchQuestions(
      quiz.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
    );
    for (const [field, value] of Object.entries(patch))
      debounced(`q:${questionId}:${field}`, () =>
        actions.updateQuestion(questionId, {
          [field]: value,
        }),
      );
  }

  async function deleteQuestion(questionId: string) {
    const remaining = quiz.questions.filter((q) => q.id !== questionId);
    patchQuestions(remaining);
    if (selectedId === questionId) {
      setSelectedId(remaining[0]?.id ?? null);
    }
    await runSave(() => actions.deleteQuestion(questionId));
  }

  function reorder(orderedIds: string[]) {
    const map = new Map(quiz.questions.map((q) => [q.id, q]));
    const next = orderedIds
      .map((id, i) => {
        const q = map.get(id)!;
        return { ...q, position: i };
      })
      .filter(Boolean) as QuestionWithOptions[];
    patchQuestions(next);
    void runSave(() => actions.reorderQuestions(quiz.id, orderedIds));
  }

  /* ---------------- options ---------------- */

  function setOptions(questionId: string, opts: OptionRow[]) {
    patchQuestions(
      quiz.questions.map((q) =>
        q.id === questionId ? { ...q, options: opts } : q,
      ),
    );
  }

  async function addOption(questionId: string) {
    const q = quiz.questions.find((x) => x.id === questionId);
    if (!q) return;
    await runSave(async () => {
      const opt = await actions.addOption(questionId);
      setOptions(questionId, [...q.options, opt]);
    });
  }

  function updateOption(
    questionId: string,
    optionId: string,
    patch: Partial<OptionRow>,
  ) {
    const q = quiz.questions.find((x) => x.id === questionId);
    if (!q) return;
    setOptions(
      questionId,
      q.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
    );
    for (const [field, value] of Object.entries(patch))
      debounced(`o:${optionId}:${field}`, () =>
        actions.updateOption(optionId, {
          [field]: value,
        }),
      );
  }

  function setCorrect(questionId: string, optionId: string) {
    const q = quiz.questions.find((x) => x.id === questionId);
    if (!q) return;
    setOptions(
      questionId,
      q.options.map((o) => ({ ...o, isCorrect: o.id === optionId })),
    );
    void runSave(() => actions.setCorrectOption(questionId, optionId));
  }

  async function deleteOption(questionId: string, optionId: string) {
    const q = quiz.questions.find((x) => x.id === questionId);
    if (!q) return;
    setOptions(
      questionId,
      q.options.filter((o) => o.id !== optionId),
    );
    await runSave(() => actions.deleteOption(optionId));
  }

  const selected = quiz.questions.find((q) => q.id === selectedId) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-paper-2">
      {/* top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b-2 border-ink/10 bg-paper/90 px-4 backdrop-blur-md">
        <Link
          href="/dashboard"
          className="hidden shrink-0 lg:block"
          aria-label="Back to dashboard"
        >
          <Logo className="h-7" />
        </Link>

        <QuizMeta
          title={quiz.title}
          coverIcon={quiz.coverIcon}
          theme={quiz.theme}
          onChange={patchQuiz}
        />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden sm:block">
            <SaveBadge state={save} />
          </span>
          <Link
            href={`/preview/${quiz.id}`}
            onClick={async (event) => {
              event.preventDefault();
              if (await flush()) router.push(`/preview/${quiz.id}`);
            }}
            aria-label="Preview as a participant"
            className="inline-flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-paper text-ink shadow-pop"
          >
            <Eye className="size-4" />
          </Link>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Quiz settings"
            className="inline-flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-paper text-ink shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <Settings2 className="size-4" />
          </button>
          <Link
            href={`/present/${quiz.id}`}
            onClick={async (event) => {
              event.preventDefault();
              if (await flush()) router.push(`/present/${quiz.id}`);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-ink bg-grape px-4 font-display text-sm font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <Play className="size-4 fill-current" />
            Launch
          </Link>
        </div>
      </header>
      {saveError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-3 border-b-2 border-coral bg-coral/10 p-3 text-sm font-semibold"
        >
          {saveError}
          <button
            onClick={() => void flush()}
            className="underline underline-offset-4"
          >
            Retry saving
          </button>
        </div>
      )}

      {settingsOpen && (
        <QuizSettingsPanel
          settings={quiz.settings}
          onChange={patchSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* body */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 lg:flex-row lg:p-6">
        <QuestionSidebar
          questions={quiz.questions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addQuestion}
          onReorder={reorder}
          onDelete={deleteQuestion}
        />

        <main className="min-w-0 flex-1">
          <QuizAppearance
            quizId={quiz.id}
            settings={quiz.settings}
            theme={quiz.theme}
            coverIcon={quiz.coverIcon}
            onSettings={patchSettings}
            onTheme={(theme) => patchQuiz({ theme })}
            onIcon={(coverIcon) => patchQuiz({ coverIcon })}
          />
          {selected ? (
            <QuestionEditor
              key={selected.id}
              question={selected}
              speedBonus={quiz.settings.speedBonus}
              index={quiz.questions.findIndex((q) => q.id === selected.id)}
              onChange={(patch) => updateQuestion(selected.id, patch)}
              onAddOption={() => addOption(selected.id)}
              onUpdateOption={(oid, patch) =>
                updateOption(selected.id, oid, patch)
              }
              onSetCorrect={(oid) => setCorrect(selected.id, oid)}
              onDeleteOption={(oid) => deleteOption(selected.id, oid)}
            />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return <span className="w-16" />;
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="hidden items-center gap-1.5 text-sm font-semibold text-ink-soft sm:flex"
    >
      {state === "error" ? (
        "Not saved"
      ) : state === "saving" ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Check className="size-4 text-mint" />
          Saved
        </>
      )}
    </motion.span>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-ink/20 p-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border-2 border-ink bg-paper animate-float">
        <ListPlus className="size-7 text-ink" />
      </div>
      <h2 className="mt-4 font-display text-xl font-bold text-ink">
        Add your first question
      </h2>
      <p className="mt-1 text-ink-soft">
        Choose a question type from the panel to begin.
      </p>
    </div>
  );
}
