"use client";

import { useActionState } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { requestReset } from "./actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, null);
  if (state?.ok) return <Callout tone="ok">{state.ok}</Callout>;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      <Field label="Email or student ID" htmlFor="identifier">
        <Input id="identifier" name="identifier" autoComplete="username" required />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending" : "Send me a link"}
      </Button>
    </form>
  );
}
