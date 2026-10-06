"use client";

import { useActionState } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { checkStatus, type StatusResult } from "../actions";

const SAY: Record<string, string> = {
  pending: "Received. The registrar has not decided yet.",
  approved: "Approved. The learner is enrolled; the school has sent the parent code to sign in to the portal.",
  declined: "Not approved.",
};

export function StatusForm() {
  const [state, action, pending] = useActionState<StatusResult, FormData>(checkStatus, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      {state?.status && (
        <Callout tone={state.status === "declined" ? "warn" : "ok"} title={state.learner}>
          {SAY[state.status] ?? state.status}
          {state.note ? ` ${state.note}` : ""}
        </Callout>
      )}
      <Field label="Reference" htmlFor="reference">
        <Input id="reference" name="reference" required autoComplete="off" placeholder="ABCD-2345" />
      </Field>
      <Field label="Mobile number" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" required autoComplete="tel" />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Checking" : "Check"}
      </Button>
    </form>
  );
}
