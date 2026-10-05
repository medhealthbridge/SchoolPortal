"use client";

import { useActionState, useEffect } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { signIn } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);

  // A real navigation, so the subdomain middleware runs again.
  useEffect(() => {
    if (state?.goTo) window.location.assign(state.goTo);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      <Field label="Email or student ID" htmlFor="identifier">
        <Input id="identifier" name="identifier" autoComplete="username" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
