"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, LayoutGrid, Shield } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { Avatar } from "@/components/ui/avatar";

export function UserMenu({
  name,
  color,
  isAdmin = false,
}: {
  name: string;
  color: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function logout() {
    start(async () => {
      await logoutAction();
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {isAdmin && (
        <Link
          href="/admin"
          className="flex items-center gap-1.5 rounded-xl border border-grape/30 bg-grape/10 px-2.5 py-1.5 text-xs font-bold text-grape transition-colors hover:bg-grape/20"
        >
          <Shield className="size-3.5" />
          Admin
        </Link>
      )}
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
    </div>
  );
}
