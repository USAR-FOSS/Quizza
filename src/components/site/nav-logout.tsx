"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";

export function NavLogout() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} aria-label="Log out" title="Log out" onClick={() => start(async () => {
    await logoutAction();
    router.push("/");
    router.refresh();
  })} className="inline-flex size-10 items-center justify-center rounded-xl text-ink-soft hover:bg-ink/5 hover:text-ink disabled:opacity-40">
    <LogOut className="size-5" aria-hidden="true" />
  </button>;
}
