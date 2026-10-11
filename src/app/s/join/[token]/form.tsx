"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { acceptParentInvite } from "../actions";

/** New parent: name and password. Existing account: its password only. */
export function JoinForm({
  token,
  email,
  suggestedName,
  hasAccount,
}: {
  token: string;
  email: string;
  suggestedName: string;
  hasAccount: boolean;
}) {
  const [state, dispatch, pending] = useActionState(acceptParentInvite, null);
  const password = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.goTo) window.location.assign(state.goTo);
  }, [state]);

  return (
    <form action={dispatch} className="grid gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      <input type="hidden" name="token" value={token} />
      <Field label="Email" hint="You sign in with this.">
        <Input value={email} readOnly aria-readonly className="bg-subtle" />
      </Field>
      {!hasAccount && (
        <Field label="Your name">
          <Input name="name" defaultValue={suggestedName} autoComplete="name" required />
        </Field>
      )}
      <Field
        label={hasAccount ? "Your password" : "Choose a password"}
        hint={hasAccount ? "You already have an account here. This child is added to it." : "At least 8 characters."}
      >
        <Input
          ref={password}
          name="password"
          type="password"
          required
          minLength={hasAccount ? 1 : 8}
          autoComplete={hasAccount ? "current-password" : "new-password"}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Linking" : hasAccount ? "Sign in and add my child" : "Create my account"}
      </Button>
    </form>
  );
}
