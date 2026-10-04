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
      className="shrink-0 rounded-[2px] border border-white/35 px-2.5 py-1 text-[0.8125rem] text-white hover:bg-white/10 disabled:opacity-50"
    >
      {pending ? "Signing out" : "Sign out"}
    </button>
  );
}
