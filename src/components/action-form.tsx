"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Button, Callout } from "./ui";
import { Toast } from "./toast";

export type ActionResult = { ok?: string; error?: string; issues?: string[] } | null;
export type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  submitLabel,
  children,
  className = "grid gap-4 sm:grid-cols-2",
  destructive,
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  destructive?: boolean;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(action, null);
  const [toast, setToast] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const prevOk = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state?.ok && state.ok !== prevOk.current) {
      prevOk.current = state.ok;
      setToast(state.ok);
      formRef.current?.reset();
    }
  }, [state]);

  const clearToast = useCallback(() => setToast(null), []);

  return (
    <>
      <form ref={formRef} action={dispatch} className="grid gap-4">
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
      {toast && <Toast message={toast} onDone={clearToast} />}
    </>
  );
}
