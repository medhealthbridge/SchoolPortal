"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { showToast } from "@/components/toast";
import { restoreStudent, withdrawStudent } from "./actions";

export function StatusButton({ id, name, withdrawn }: { id: string; name: string; withdrawn: boolean }) {
  const [pending, start] = useTransition();

  function run() {
    if (!withdrawn && !window.confirm(`Withdraw ${name}? Their records are kept and you can restore them later.`))
      return;
    const form = new FormData();
    form.set("id", id);
    start(async () => {
      try {
        await (withdrawn ? restoreStudent : withdrawStudent)(form);
        showToast(withdrawn ? `${name} restored.` : `${name} withdrawn.`);
      } catch {
        showToast("That did not go through. Try again.", "danger");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={run}
      className={withdrawn ? undefined : "text-danger"}
    >
      {pending ? "Saving…" : withdrawn ? "Restore" : "Withdraw"}
    </Button>
  );
}
