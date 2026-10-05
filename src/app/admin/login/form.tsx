"use client";

import { useActionState, useEffect } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { adminSignIn } from "./actions";

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminSignIn, null);

  useEffect(() => {
    if (state?.goTo) window.location.assign(state.goTo);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      <Field label="Email" htmlFor="a-email">
        <Input id="a-email" name="email" type="email" required autoComplete="username" />
      </Field>
      <Field label="Password" htmlFor="a-password">
        <Input
          id="a-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <Field label="Six-digit code" htmlFor="a-code" hint="From your authenticator app.">
        <Input id="a-code" name="code" inputMode="numeric" pattern="\d{6}" required />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Checking" : "Sign in"}
      </Button>
    </form>
  );
}
