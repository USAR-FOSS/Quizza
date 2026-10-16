"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/** Native top-layer dialog: viewport bounds, focus trapping, Escape, focus return. */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto overscroll-contain rounded-3xl border-2 border-ink bg-paper p-0 text-ink shadow-pop-lg backdrop:bg-ink/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-7">
        <header className="mb-5 flex items-center justify-between gap-3">
          <h2
            id={id}
            className="font-display text-2xl font-extrabold tracking-tight"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-xl p-2 hover:bg-paper-2"
          >
            <X className="size-5" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
