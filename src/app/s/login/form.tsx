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
      <Field
        label="Password"
        htmlFor="password"
        hint={
          <a href="/forgot" className="font-medium text-ink underline underline-offset-2">
            Forgot your password?
          </a>
        }
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="remember" defaultChecked className="size-5" />
        <span>Keep me signed in</span>
      </label>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
