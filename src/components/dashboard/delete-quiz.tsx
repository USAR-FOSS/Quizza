"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteQuiz } from "@/lib/actions/quiz";

export function DeleteQuiz({ quizId, title }: { quizId: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  function remove() {
    start(async () => {
      await deleteQuiz(quizId);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex gap-2">
        <button
          onClick={remove}
          disabled={pending}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-ink bg-coral font-display text-sm font-bold text-white shadow-pop"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="flex h-10 flex-1 items-center justify-center rounded-xl border-2 border-ink bg-paper font-display text-sm font-bold text-ink shadow-pop"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      aria-label={`Delete ${title}`}
      className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-ink/20 bg-paper font-display text-sm font-bold text-ink-soft transition-colors hover:border-ink hover:text-coral"
    >
      <Trash2 className="size-4" />
      Delete
    </button>
  );
}
