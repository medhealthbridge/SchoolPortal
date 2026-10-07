"use client";

import { useTransition } from "react";
import type { Navigation } from "@/lib/nav";

export function SignOutButton({ action }: { action: () => Promise<Navigation> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { goTo } = await action();
          window.location.assign(goTo);
        })
      }
      className="h-11 shrink-0 rounded-control border border-line bg-surface px-3 text-sm font-medium text-ink shadow-control hover:bg-subtle disabled:opacity-50 lg:h-9 lg:w-full"
    >
      {pending ? "Signing out" : "Sign out"}
    </button>
  );
}
