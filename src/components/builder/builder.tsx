"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Play, Check, Loader2, ListPlus } from "lucide-react";
import { Logo } from "@/components/site/logo";
import { QuestionSidebar } from "@/components/builder/question-sidebar";
import { QuestionEditor } from "@/components/builder/question-editor";
import { QuizMeta } from "@/components/builder/quiz-meta";
import * as actions from "@/lib/actions/quiz";
import type {
  OptionRow,
  QuestionType,
  QuestionWithOptions,
  QuizWithQuestions,
} from "@/lib/db/schema-types";

type SaveState = "idle" | "saving" | "saved";

export function Builder({ initial }: { initial: QuizWithQuestions }) {
  const [quiz, setQuiz] = useState<QuizWithQuestions>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.questions[0]?.id ?? null,
  );
  const [save, setSave] = useState<SaveState>("idle");

  // per-key debounce timers for text fields
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSave = useCallback(async (fn: () => Promise<unknown>) => {
    setSave("saving");
    try {
      await fn();
      setSave("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSave("idle"), 1200);
    } catch (err) {
      console.error(err);
      setSave("idle");
    }
  }, []);

  const debounced = useCallback(
    (key: string, fn: () => Promise<unknown>, delay = 500) => {
      if (timers.current[key]) clearTimeout(timers.current[key]);
      setSave("saving");
      timers.current[key] = setTimeout(() => void runSave(fn), delay);
    },
    [runSave],
  );

  /* ---------------- quiz meta ---------------- */

  function patchQuiz(patch: Partial<QuizWithQuestions>) {
    setQuiz((q) => ({ ...q, ...patch }));
    debounced("quiz", () =>
      actions.updateQuiz(quiz.id, {
        title: patch.title,
        coverIcon: patch.coverIcon,
        theme: patch.theme,
      }),
    );
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
    debounced(`q:${questionId}`, () =>
      actions.updateQuestion(questionId, {
        prompt: patch.prompt,
        timeLimitSec: patch.timeLimitSec,
        points: patch.points,
        settings: patch.settings,
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
    debounced(`o:${optionId}`, () =>
      actions.updateOption(optionId, {
        label: patch.label,
        color: patch.color,
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
        <Link href="/" className="shrink-0">
          <Logo className="h-7" />
        </Link>

        <QuizMeta
          title={quiz.title}
          coverIcon={quiz.coverIcon}
          theme={quiz.theme}
          onChange={patchQuiz}
        />

        <div className="flex shrink-0 items-center gap-3">
          <SaveBadge state={save} />
          <Link
            href={`/present/${quiz.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-ink bg-grape px-4 font-display text-sm font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <Play className="size-4 fill-current" />
            Present
          </Link>
        </div>
      </header>

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
          {selected ? (
            <QuestionEditor
              key={selected.id}
              question={selected}
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
      {state === "saving" ? (
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
