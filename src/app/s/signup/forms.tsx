"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { parentSignUp, studentSignUp } from "./actions";

type Result = { error?: string; goTo?: string } | null;

export default function SignupForms() {
  const [tab, setTab] = useState<"student" | "parent">("student");
  const [studentState, studentAction, studentPending] = useActionState<Result, FormData>(
    studentSignUp,
    null,
  );
  const [parentState, parentAction, parentPending] = useActionState<Result, FormData>(
    parentSignUp,
    null,
  );
  const state = tab === "student" ? studentState : parentState;

  useEffect(() => {
    if (state?.goTo) window.location.assign(state.goTo);
  }, [state]);

  return (
    <div className="flex flex-col gap-5">
      <div
        className="grid gap-0 rounded-panel bg-subtle p-[3px]"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
      >
        {(["student", "parent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`h-10 rounded-control text-sm font-medium ${
              tab === t ? "bg-surface text-ink shadow-card" : "text-muted-strong"
            }`}
          >
            {t === "student" ? "I am a student" : "I am a parent"}
          </button>
        ))}
      </div>

      {state?.error && <Callout tone="danger">{state.error}</Callout>}

      {tab === "student" ? (
        <form action={studentAction} className="flex flex-col gap-4">
          <Field label="Student ID" htmlFor="s-id">
            <Input id="s-id" name="studentNumber" required />
          </Field>
          <Field
            label="Activation code"
            htmlFor="s-code"
            hint="Printed by your school. Not your birthdate — classmates know that."
          >
            <Input id="s-code" name="code" required />
          </Field>
          <Field label="Your name" htmlFor="s-name">
            <Input id="s-name" name="name" />
          </Field>
          <Field label="Email (optional)" htmlFor="s-email">
            <Input id="s-email" name="email" type="email" />
          </Field>
          <Field label="Choose a password" htmlFor="s-password">
            <Input id="s-password" name="password" type="password" required minLength={8} />
          </Field>
          <Button type="submit" size="lg" disabled={studentPending}>
            {studentPending ? "Creating" : "Create my account"}
          </Button>
        </form>
      ) : (
        <form action={parentAction} className="flex flex-col gap-4">
          <Field label="Your child's student ID" htmlFor="p-id">
            <Input id="p-id" name="studentNumber" required />
          </Field>
          <Field label="Parent code" htmlFor="p-code" hint="A separate code from the student's.">
            <Input id="p-code" name="code" required />
          </Field>
          <Field label="Your name" htmlFor="p-name">
            <Input id="p-name" name="name" required />
          </Field>
          <Field
            label="Your email"
            htmlFor="p-email"
            hint="Sign in with this. Add more children with the same email."
          >
            <Input id="p-email" name="email" type="email" required />
          </Field>
          <Field label="Choose a password" htmlFor="p-password">
            <Input id="p-password" name="password" type="password" required minLength={8} />
          </Field>
          <Button type="submit" size="lg" disabled={parentPending}>
            {parentPending ? "Linking" : "Link my child"}
          </Button>
        </form>
      )}
    </div>
  );
}
