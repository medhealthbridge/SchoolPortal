"use client";

import { useActionState, useCallback } from "react";
import { Button, Callout } from "./ui";
import { showToast } from "./toast";

export type ActionResult = { ok?: string; error?: string; issues?: string[] } | null;
export type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  submitLabel,
  children,
  className = "grid gap-4 sm:grid-cols-2",
  destructive,
  confirm,
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  destructive?: boolean;
  /** Asked before submitting; cancelling sends nothing. */
  confirm?: string;
}) {
  // Toasting here rather than from an effect: a delete removes this very form
  // in the same commit as its result, and an effect on a gone component never
  // runs, so the row would vanish with nothing said.
  const run = useCallback(
    async (prev: ActionResult, form: FormData) => {
      const result = await action(prev, form);
      if (result?.ok) showToast(result.ok);
      return result;
    },
    [action],
  );
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(run, null);

  const long = Boolean(state?.ok && state.ok.length > 80);

  return (
    <form
      action={dispatch}
      className="grid gap-4"
      onSubmit={confirm ? (e) => !window.confirm(confirm) && e.preventDefault() : undefined}
    >
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
      {long && <Callout tone="ok">{state!.ok}</Callout>}
      <div className={className}>{children}</div>
      <div>
        <Button
          type="submit"
          disabled={pending}
          variant={destructive ? "ghost" : undefined}
          className={destructive ? "text-danger text-xs" : undefined}
        >
          {pending ? (
            <span className="flex items-center gap-2">
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving…
            </span>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
