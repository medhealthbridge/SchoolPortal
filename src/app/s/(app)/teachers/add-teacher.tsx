"use client";

import { useActionState, useRef } from "react";
import { Button, Callout, Field, Input, Select } from "@/components/ui";
import type { ActionResult } from "@/components/action-form";
import { addTeacher } from "./actions";

/** "Maria Dela Cruz" → maria.delacruz@school.example.com, until the person types their own. */
function suggestEmail(name: string, subdomain: string, root: string) {
  const parts = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  const local = parts.length === 1 ? parts[0] : `${parts[0]}.${parts.slice(1).join("")}`;
  return `${local}@${subdomain}.${root.split(":")[0]}`;
}

export function AddTeacherForm({ subdomain, root }: { subdomain: string; root: string }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(addTeacher, null);
  const email = useRef<HTMLInputElement>(null);
  const edited = useRef(false);

  return (
    <form action={dispatch} className="grid gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      {state?.ok && <Callout tone="ok">{state.ok}</Callout>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name">
          <Input
            name="name"
            required
            autoComplete="off"
            onChange={(e) => {
              if (!edited.current && email.current)
                email.current.value = suggestEmail(e.target.value, subdomain, root);
            }}
          />
        </Field>
        <Field
          label="Email"
          hint="Their sign-in. Filled in from the name and your school's address; use their own email to have the invite sent to them."
        >
          <Input
            ref={email}
            name="email"
            type="email"
            required
            autoComplete="off"
            onChange={() => (edited.current = true)}
          />
        </Field>
        <Field label="Role" hint="An adviser also sees their whole section.">
          <Select name="role" defaultValue="teacher">
            <option value="teacher">Teacher</option>
            <option value="adviser">Teacher and adviser</option>
          </Select>
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding" : "Add teacher"}
        </Button>
      </div>
    </form>
  );
}
