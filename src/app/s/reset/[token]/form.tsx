"use client";

import { useActionState, useEffect } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { setNewPassword } from "../../forgot/actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setNewPassword, null);
  useEffect(() => {
    if (state?.goTo) window.location.assign(state.goTo);
  }, [state]);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="The same again" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving" : "Set new password"}
      </Button>
    </form>
  );
}
