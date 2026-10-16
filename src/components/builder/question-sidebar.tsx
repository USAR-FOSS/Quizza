"use client";

import { useState } from "react";
import { Reorder } from "motion/react";
import { Dialog } from "@/components/ui/dialog";
import { Plus, GripVertical, Trash2 } from "lucide-react";
import { QUESTION_TYPES, QUESTION_TYPE_ORDER } from "@/lib/quiz-constants";
import { QUESTION_TYPE_ICON } from "@/components/ui/quiz-icons";
import type { QuestionType, QuestionWithOptions } from "@/lib/db/schema-types";
import { cn } from "@/lib/utils";

type Props = {
  questions: QuestionWithOptions[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: QuestionType) => void;
  onReorder: (orderedIds: string[]) => void;
  onDelete: (id: string) => void;
};

export function QuestionSidebar({
  questions,
  selectedId,
  onSelect,
  onAdd,
  onReorder,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ids = questions.map((q) => q.id);

  return (
    <aside className="w-full shrink-0 lg:w-72">
      <div className="rounded-3xl border-2 border-ink bg-paper p-3 shadow-pop">
        <div className="flex items-center justify-between px-2 py-1">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-ink-soft">
            Questions
          </h2>
          <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs font-bold text-ink-soft">
            {questions.length}
          </span>
        </div>

        <Reorder.Group
          axis="y"
          values={ids}
          onReorder={onReorder}
          className="mt-2 flex flex-col gap-2"
        >
          {questions.map((q, i) => (
            <Reorder.Item
              key={q.id}
              value={q.id}
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-2xl border-2 bg-paper-2 p-2.5 transition-colors",
                selectedId === q.id
                  ? "border-ink bg-white shadow-pop"
                  : "border-transparent hover:border-ink/20",
              )}
              onClick={() => onSelect(q.id)}
              tabIndex={0}
              aria-label={`Question ${i + 1}: ${q.prompt || QUESTION_TYPES[q.type].label}${selectedId === q.id ? ", selected" : ""}`}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(q.id);
                }
                if (
                  event.altKey &&
                  ["ArrowUp", "ArrowDown"].includes(event.key)
                ) {
                  event.preventDefault();
                  const target = i + (event.key === "ArrowUp" ? -1 : 1);
                  if (target >= 0 && target < ids.length) {
                    const next = [...ids];
                    [next[i], next[target]] = [next[target], next[i]];
                    onReorder(next);
                  }
                }
              }}
              whileDrag={{ scale: 1.03 }}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-ink-soft/50 active:cursor-grabbing" />
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-paper font-display text-xs font-extrabold text-ink">
                {i + 1}
              </span>
              {(() => {
                const Icon = QUESTION_TYPE_ICON[q.type];
                return <Icon className="size-4 shrink-0 text-ink-soft" />;
              })()}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                {q.prompt || (
                  <span className="text-ink-soft/60">
                    {QUESTION_TYPES[q.type].label}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(q.id);
                }}
                className="shrink-0 rounded-lg p-1 text-ink-soft transition-opacity hover:bg-coral/15 hover:text-coral lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
                aria-label="Delete question"
              >
                <Trash2 className="size-4" />
              </button>
            </Reorder.Item>
          ))}
        </Reorder.Group>
        {questions.length > 1 && (
          <p className="mt-3 px-2 text-[11px] text-ink-soft">
            Drag to reorder, or focus a question and use Alt + ↑ / ↓.
          </p>
        )}

        {/* add question */}
        <div className="relative mt-2">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/30 py-3 font-display text-sm font-bold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            <Plus className="size-4" />
            Add question
          </button>

          {menuOpen && (
            <Dialog
              title="What’s your next move?"
              onClose={() => setMenuOpen(false)}
            >
              <p className="mb-4 text-sm text-ink-soft">
                Test a hunch, take a vote, or get the whole room talking.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {QUESTION_TYPE_ORDER.map((type) => {
                  const meta = QUESTION_TYPES[type];
                  const Icon = QUESTION_TYPE_ICON[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        onAdd(type);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-start gap-3 rounded-2xl border-2 border-ink/15 bg-paper-2 p-4 text-left transition hover:border-grape hover:bg-white"
                    >
                      <Icon className="mt-0.5 size-5 shrink-0 text-ink" />
                      <span className="min-w-0">
                        <span className="block font-display text-sm font-bold text-ink">
                          {meta.label}
                        </span>
                        <span className="block text-xs text-ink-soft">
                          {meta.blurb}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Dialog>
          )}
        </div>
      </div>
    </aside>
  );
}
