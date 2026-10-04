"use client";

import { useActionState, useEffect } from "react";
import { Banner, Button, Field, Input } from "@/components/ui";
import { signIn } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);

  // A real navigation, so the subdomain middleware runs again.
  useEffect(() => {
    if (state?.goTo) window.location.assign(state.goTo);
  }, [state]);

  return (
    <form action={action} className="grid gap-4">
      {state?.error && <Banner tone="danger">{state.error}</Banner>}
      <Field label="Email or student ID">
        <Input name="identifier" autoComplete="username" required />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
