"use client";

import { useActionState } from "react";
import { Button, Callout } from "./ui";

export type ActionResult = { ok?: string; error?: string; issues?: string[] } | null;
export type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  submitLabel,
  children,
  className = "grid gap-4 sm:grid-cols-2",
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(action, null);
  return (
    <form action={dispatch} className="grid gap-4">
      {state?.error && (
        <Callout tone="danger">
          {state.error}
          {state.issues && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {state.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </Callout>
      )}
      {state?.ok && <Callout tone="ok">{state.ok}</Callout>}
      <div className={className}>{children}</div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
