"use client";

import { useActionState } from "react";
import { Button, Callout, Field, Input, Select } from "@/components/ui";
import { approve, decline, type DecideResult } from "./actions";

export function Decide({
  applicationId,
  suggestedNumber,
  sections,
}: {
  applicationId: string;
  suggestedNumber: string;
  sections: { id: string; label: string; fits: boolean }[];
}) {
  const [okState, approveAction, approving] = useActionState<DecideResult, FormData>(approve, null);
  const [noState, declineAction, declining] = useActionState<DecideResult, FormData>(decline, null);
  const done = okState?.ok ?? noState?.ok;
  if (done) return <Callout tone="ok">{done}</Callout>;
  const fitting = sections.filter((s) => s.fits);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={approveAction} className="grid gap-3">
        {okState?.error && <Callout tone="danger">{okState.error}</Callout>}
        <input type="hidden" name="applicationId" value={applicationId} />
        <Field label="Student number">
          <Input name="studentNumber" defaultValue={suggestedNumber} required />
        </Field>
        <Field label="Section">
          <Select name="sectionId" required defaultValue={fitting[0]?.id ?? ""}>
            <option value="" disabled>
              Choose a section
            </option>
            {(fitting.length ? fitting : sections).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <Button type="submit" disabled={approving}>
            {approving ? "Enrolling" : "Approve and enrol"}
          </Button>
        </div>
      </form>
      <form action={declineAction} className="grid gap-3">
        {noState?.error && <Callout tone="danger">{noState.error}</Callout>}
        <input type="hidden" name="applicationId" value={applicationId} />
        <Field label="Why not" hint="The family reads this: the grade is full, a document is missing.">
          <Input name="note" />
        </Field>
        <div>
          <Button type="submit" variant="secondary" disabled={declining}>
            {declining ? "Declining" : "Decline"}
          </Button>
        </div>
      </form>
    </div>
  );
}
