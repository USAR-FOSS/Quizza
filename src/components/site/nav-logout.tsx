"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";

export function NavLogout() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function logout() {
    setError(null);
    start(async () => {
      try {
        await logoutAction();
      } catch (err) {
        console.error("Host logout failed, purging local session state:", err);
        setError("Network error during logout. Session reset.");
      } finally {
        if (typeof window !== "undefined") {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch {}
        }
        router.push("/");
        router.refresh();
      }
    });
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        disabled={pending}
        aria-label="Log out"
        title="Log out"
        onClick={logout}
        className="inline-flex size-10 items-center justify-center rounded-xl text-ink-soft hover:bg-ink/5 hover:text-ink disabled:opacity-40"
      >
        <LogOut className="size-5" aria-hidden="true" />
      </button>
      {error && (
        <span
          role="alert"
          className="absolute right-0 top-full mt-1 whitespace-nowrap rounded-lg border border-coral/20 bg-coral/10 px-2 py-1 text-xs font-semibold text-coral"
        >
          {error}
        </span>
      )}
    </div>
  );
}
