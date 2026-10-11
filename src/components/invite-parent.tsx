"use client";

import { useActionState, useState } from "react";
import { inviteParent, type InviteResult } from "@/app/s/(app)/classes/actions";
import { Button, Callout, Field, Input, Select } from "./ui";

/**
 * Invite a parent for one child. On success the link stays on screen with a
 * copy button and a "text it" link, because without a mail provider the
 * teacher is the one who sends it.
 */
export function InviteParentForm({ studentId, childName }: { studentId: string; childName: string }) {
  const [state, dispatch, pending] = useActionState<InviteResult, FormData>(inviteParent, null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      {state?.link && (
        <Callout tone="ok" title={state.ok}>
          <span className="mt-1 block break-all font-mono text-[13px] text-ink">{state.link}</span>
          <span className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.link!);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            {state.phone && (
              <a
                className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium text-ink no-underline shadow-control"
                href={`sms:${state.phone}?body=${encodeURIComponent(`Follow ${childName} at school: ${state.link}`)}`}
              >
                Text it
              </a>
            )}
          </span>
        </Callout>
      )}
      <form action={dispatch} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="studentId" value={studentId} />
        <Field label="Parent's name">
          <Input name="name" required autoComplete="off" />
        </Field>
        <Field label="Relationship">
          <Select name="relationship" defaultValue="mother">
            <option value="mother">Mother</option>
            <option value="father">Father</option>
            <option value="guardian">Guardian</option>
            <option value="grandparent">Grandparent</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Email" hint="How they will sign in. Siblings invited to the same email share one account.">
          <Input name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Mobile number" hint="Optional. The link is texted when the school has SMS.">
          <Input name="phone" type="tel" inputMode="tel" autoComplete="off" />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating invite" : `Invite ${childName}'s parent`}
          </Button>
        </div>
      </form>
    </div>
  );
}
