"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { endOwnedSession } from "@/lib/actions/host";

export function EndSession({ code }: { code: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        className="text-xs font-bold text-ink-soft hover:text-grape disabled:opacity-50"
        onClick={() => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          start(async () => {
            try {
              await endOwnedSession(code);
              router.refresh();
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Couldn’t end the session.",
              );
            }
          });
        }}
      >
        {pending ? "Ending…" : confirm ? "End for everyone?" : "End session"}
      </button>
      {confirm && !pending && (
        <button className="text-xs underline" onClick={() => setConfirm(false)}>
          Cancel
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-grape-dark">
          {error}
        </span>
      )}
    </div>
  );
}
