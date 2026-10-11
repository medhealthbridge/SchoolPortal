"use client";

import { useActionState } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { startNextYear, type RolloverResult } from "./actions";

type Line = { studentId: string; name: string; fromLevel: string; section: string; average: number | null; outcome: string; toLevel: string | null };

export function RolloverForm({ suggested, lines }: { suggested: { name: string; startsOn: string; endsOn: string }; lines: Line[] }) {
  const [state, action, pending] = useActionState<RolloverResult, FormData>(startNextYear, null);
  if (state?.ok)
    return (
      <Callout tone="ok" title="Done">
        {state.ok} <a href="/schedule">Open the schedule</a>.
      </Callout>
    );
  const held = lines.filter((l) => l.outcome === "retained");
  return (
    <form action={action} className="grid gap-6">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="New school year">
          <Input name="name" defaultValue={suggested.name} required />
        </Field>
        <Field label="Starts">
          <Input name="startsOn" type="date" defaultValue={suggested.startsOn} required />
        </Field>
        <Field label="Ends">
          <Input name="endsOn" type="date" defaultValue={suggested.endsOn} required />
        </Field>
      </div>
      {held.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Below 75: change any who passed remedial classes</p>
          <ul className="grid gap-2">
            {held.map((l) => (
              <li key={l.studentId} className="flex flex-wrap items-center gap-3 border-t border-line pt-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{l.name}</span>
                  <span className="block text-[13px] text-muted">
                    {l.fromLevel} {l.section} · general average {l.average}
                  </span>
                </span>
                <select
                  name={`outcome:${l.studentId}`}
                  defaultValue="retained"
                  aria-label={`What happens to ${l.name}`}
                  className="h-11 rounded-control border border-line-strong bg-surface px-3 shadow-control"
                >
                  <option value="retained">Keep at {l.fromLevel}</option>
                  <option value="promoted">Promote</option>
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="confirm" value="yes" className="h-5 w-5" required />
        I have closed last year&apos;s grades. Start the new year now.
      </label>
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Starting" : "Start the new school year"}
        </Button>
      </div>
    </form>
  );
}
