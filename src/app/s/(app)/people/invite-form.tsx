"use client";

import { useActionState, useRef } from "react";
import { Button, Callout, Field, Input, Select } from "@/components/ui";
import type { ActionResult } from "@/components/action-form";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/roles";
import { roleAddress } from "@/lib/slug";
import { inviteStaff } from "../setup/actions";

/**
 * The email starts as the role's address at this school, such as
 * teacher@stmary.example.com, and follows the role until the person types
 * their own. It is a suggestion: replace it with a real inbox to have the
 * invite emailed.
 */
export function InviteForm({ subdomain, root }: { subdomain: string; root: string }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(inviteStaff, null);
  const email = useRef<HTMLInputElement>(null);
  const edited = useRef(false);
  const first = STAFF_ROLES.includes("teacher") ? "teacher" : STAFF_ROLES[0];

  return (
    <form action={dispatch} className="grid gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      {state?.ok && <Callout tone="ok">{state.ok}</Callout>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Role">
          <Select
            name="role"
            required
            defaultValue={first}
            onChange={(e) => {
              if (!edited.current && email.current)
                email.current.value = roleAddress(e.target.value, subdomain, root);
            }}
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Email"
          hint="A suggestion, made from the role and your school's address. Put the person's own email here to have the invite emailed to them."
        >
          <Input
            ref={email}
            name="email"
            type="email"
            required
            defaultValue={roleAddress(first, subdomain, root)}
            onChange={() => (edited.current = true)}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Create invite"}
        </Button>
      </div>
    </form>
  );
}
