"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { adminSignIn } from "./actions";

/** "ABCDEFGH…" → "ABCD EFGH …", which is how an authenticator app shows a key. */
const grouped = (key: string) => key.replace(/(.{4})/g, "$1 ").trim();

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminSignIn, null);
  const [code, setCode] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const typed = useRef({ email: "", password: "" });
  const enroll = state?.enroll ?? null;

  useEffect(() => {
    if (state?.goTo) window.location.assign(state.goTo);
    // A code is good for thirty seconds and has just been spent or refused.
    setCode("");
    // React 19 resets a form after every action, and that wipes the password —
    // on a phone, between the first step and the enrolment step, a 22-character
    // string somebody would have to type again. Put back what was typed.
    if (emailRef.current && !emailRef.current.value) emailRef.current.value = typed.current.email;
    if (passwordRef.current && !passwordRef.current.value) {
      passwordRef.current.value = typed.current.password;
    }
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}

      <Field label="Email" htmlFor="a-email">
        <Input
          id="a-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          ref={emailRef}
          onChange={(e) => (typed.current.email = e.target.value)}
        />
      </Field>
      <Field label="Password" htmlFor="a-password">
        <Input
          id="a-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          ref={passwordRef}
          onChange={(e) => (typed.current.password = e.target.value)}
        />
      </Field>

      {enroll ? (
        <div className="grid gap-3 rounded-control border border-line bg-subtle p-4">
          <input type="hidden" name="enrolling" value={enroll.secret} />
          <p className="font-medium">Set up your authenticator</p>
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted">
            <li>Open an authenticator app — Google Authenticator, Microsoft Authenticator, 1Password or Authy.</li>
            <li>Add an account and choose <strong className="font-medium text-ink">enter a setup key</strong>.</li>
            <li>Type this key, then enter the six digits the app shows.</li>
          </ol>
          <p
            className="select-all rounded-control border border-line-strong bg-surface px-3 py-2.5 text-center font-mono text-[15px] font-medium tracking-wider"
            aria-label="Setup key"
          >
            {grouped(enroll.secret)}
          </p>
          <a
            href={enroll.uri}
            className="inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-4 text-sm font-medium text-ink no-underline shadow-control"
          >
            Open in my authenticator app
          </a>
          <p className="text-[13px] text-muted">
            This key is only shown now. Once it is saved you will need the app
            every time you sign in.
          </p>
        </div>
      ) : null}

      <Field
        label={enroll ? "Code from the app" : "Six-digit code"}
        htmlFor="a-code"
        hint={
          enroll
            ? undefined
            : "From your authenticator app. First time signing in? Leave it empty and you will set one up next."
        }
      >
        <Input
          id="a-code"
          name="code"
          inputMode="numeric"
          pattern="\d{6}"
          autoComplete="one-time-code"
          required={Boolean(enroll)}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Checking" : enroll ? "Save and sign in" : "Sign in"}
      </Button>
    </form>
  );
}
