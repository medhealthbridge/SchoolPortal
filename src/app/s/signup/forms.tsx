"use client";

import { useActionState, useEffect, useState } from "react";
import { Banner, Button, Field, Input } from "@/components/ui";
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
    <div>
      <div className="mb-5 flex gap-2 text-sm">
        {(["student", "parent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 ${
              tab === t
                ? "brand-bg text-white"
                : "border border-[var(--rule)]"
            }`}
          >
            {t === "student" ? "I am a student" : "I am a parent"}
          </button>
        ))}
      </div>

      {state?.error && (
        <div className="mb-4">
          <Banner tone="danger">{state.error}</Banner>
        </div>
      )}

      {tab === "student" ? (
        <form action={studentAction} className="grid gap-4">
          <Field label="Student ID">
            <Input name="studentNumber" required />
          </Field>
          <Field
            label="Activation code"
            hint="Printed by your school. Not your birthdate — classmates know that."
          >
            <Input name="code" required />
          </Field>
          <Field label="Your name">
            <Input name="name" />
          </Field>
          <Field label="Email (optional)">
            <Input name="email" type="email" />
          </Field>
          <Field label="Choose a password">
            <Input name="password" type="password" required minLength={8} />
          </Field>
          <Button type="submit" disabled={studentPending}>
            {studentPending ? "Creating…" : "Create my account"}
          </Button>
        </form>
      ) : (
        <form action={parentAction} className="grid gap-4">
          <Field label="Child's student ID">
            <Input name="studentNumber" required />
          </Field>
          <Field label="Parent code" hint="A separate code from the student's.">
            <Input name="code" required />
          </Field>
          <Field label="Your name">
            <Input name="name" required />
          </Field>
          <Field label="Your email" hint="Sign in with this. Add more children with the same email.">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Choose a password">
            <Input name="password" type="password" required minLength={8} />
          </Field>
          <Button type="submit" disabled={parentPending}>
            {parentPending ? "Linking…" : "Link my child"}
          </Button>
        </form>
      )}
    </div>
  );
}
