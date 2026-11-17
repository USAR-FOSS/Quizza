"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, LayoutGrid } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { Avatar } from "@/components/ui/avatar";

export function UserMenu({ name, color }: { name: string; color: string }) {
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
    <div className="flex items-center gap-2">
      <Link
        href="/dashboard"
        className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink sm:flex"
      >
        <LayoutGrid className="size-4" />
        Dashboard
      </Link>
      <Link href="/dashboard" aria-label={name}>
        <Avatar name={name} color={color} size="sm" />
      </Link>
      <button
        onClick={logout}
        disabled={pending}
        aria-label="Log out"
        className="rounded-xl p-2 text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
      >
        <LogOut className="size-4" />
      </button>
      {error && (
        <span role="alert" className="text-xs font-semibold text-coral">
          {error}
        </span>
      )}
    </div>
  );
}
