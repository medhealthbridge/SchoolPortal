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
      className="rounded-md border border-white/30 px-2 py-1 text-xs hover:bg-white/10"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
