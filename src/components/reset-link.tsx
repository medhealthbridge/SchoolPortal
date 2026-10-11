"use client";

import { useActionState, useState } from "react";
import { issueResetLink, type ResetLinkResult } from "@/app/s/(app)/people/reset-actions";
import { Button } from "./ui";

/** "Reset password" → a one-time link to copy and hand over. */
export function ResetLinkButton({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState<ResetLinkResult, FormData>(issueResetLink, null);
  const [copied, setCopied] = useState(false);

  if (state?.link) {
    return (
      <span className="grid max-w-[22rem] gap-2 text-left">
        <span className="text-[13px] text-muted">
          Send {name} this link. It works once, for 3 days.
        </span>
        <span className="break-all font-mono text-[13px]">{state.link}</span>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(state.link!);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </span>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      {state?.error && <span className="mb-1 block text-[13px] text-[var(--danger-icon)]">{state.error}</span>}
      <Button type="submit" variant="ghost" disabled={pending} aria-label={`Reset ${name}'s password`}>
        {pending ? "Making link" : "Reset password"}
      </Button>
    </form>
  );
}
