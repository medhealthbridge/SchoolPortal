"use client";

import { useActionState, useEffect } from "react";
import { Banner, Button, Field, Input } from "@/components/ui";
import { adminSignIn } from "./actions";

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminSignIn, null);

  useEffect(() => {
    if (state?.goTo) window.location.assign(state.goTo);
  }, [state]);

  return (
    <form action={action} className="grid gap-4">
      {state?.error && <Banner tone="danger">{state.error}</Banner>}
      <Field label="Email">
        <Input name="email" type="email" required autoComplete="username" />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" required autoComplete="current-password" />
      </Field>
      <Field label="Six-digit code" hint="From your authenticator app.">
        <Input name="code" inputMode="numeric" pattern="\d{6}" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </Button>
    </form>
  );
}
