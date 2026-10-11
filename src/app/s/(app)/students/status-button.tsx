"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { showToast } from "@/components/toast";
import { restoreStudent, withdrawStudent } from "./actions";

export function StatusButton({
  id,
  name,
  withdrawn,
  size = "sm",
}: {
  id: string;
  name: string;
  withdrawn: boolean;
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();

  function run() {
    if (!withdrawn && !window.confirm(`Withdraw ${name}? Their records are kept and you can restore them later.`))
      return;
    const form = new FormData();
    form.set("id", id);
    start(async () => {
      try {
        // What the server did, not what we asked for: a second tap on a roster
        // someone else already changed must not claim it worked.
        const result = await (withdrawn ? restoreStudent : withdrawStudent)(form);
        if (result?.error) showToast(result.error, "danger");
        else if (result?.ok) showToast(result.ok);
      } catch {
        showToast("That did not go through. Try again.", "danger");
      }
    });
  }

  return (
    <Button
      type="button"
      variant={withdrawn ? "secondary" : "ghost"}
      size={size}
      disabled={pending}
      onClick={run}
      className={withdrawn ? undefined : "text-danger"}
    >
      {pending ? "Saving…" : withdrawn ? "Restore" : "Withdraw"}
    </Button>
  );
}
