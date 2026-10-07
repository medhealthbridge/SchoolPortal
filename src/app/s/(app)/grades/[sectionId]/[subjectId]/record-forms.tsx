"use client";

import { useActionState } from "react";
import { Button, Callout, Field, Input, Select } from "@/components/ui";
import { addAssessment, postQuarterlyGrades } from "../../record-actions";

type Result = { ok?: string; error?: string; issues?: string[] } | null;

export function AddAssessmentForm({
  sectionId,
  subjectId,
  gradingPeriodId,
}: {
  sectionId: string;
  subjectId: string;
  gradingPeriodId: string;
}) {
  const [state, action, pending] = useActionState<Result, FormData>(addAssessment, null);
  return (
    <form action={action} className="grid gap-4">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      {state?.ok && <Callout tone="ok">{state.ok}</Callout>}
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="gradingPeriodId" value={gradingPeriodId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Component">
          <Select name="component" defaultValue="ww">
            <option value="ww">Written Work</option>
            <option value="pt">Performance Task</option>
            <option value="qa">Quarterly Assessment</option>
          </Select>
        </Field>
        <Field label="Name" hint="“Quiz 1”, “Group report”, “Quarterly exam”.">
          <Input name="title" required autoComplete="off" />
        </Field>
        <Field label="Highest possible score">
          <Input name="highestScore" inputMode="decimal" required autoComplete="off" />
        </Field>
        <Field label="Given on" hint="Optional.">
          <Input name="givenOn" type="date" />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding" : "Add to the record"}
        </Button>
      </div>
    </form>
  );
}

export function PostGradesForm({
  sectionId,
  subjectId,
  gradingPeriodId,
  ready,
  periodName,
}: {
  sectionId: string;
  subjectId: string;
  gradingPeriodId: string;
  ready: number;
  periodName: string;
}) {
  const [state, action, pending] = useActionState<Result, FormData>(postQuarterlyGrades, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      {state?.ok && <Callout tone="ok">{state.ok}</Callout>}
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="gradingPeriodId" value={gradingPeriodId} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || ready === 0}>
          {pending ? "Posting" : `Post ${ready} ${ready === 1 ? "grade" : "grades"} to report cards`}
        </Button>
        <span className="text-sm text-muted">
          Copies each quarterly grade to {periodName} on the report card. Post again after any change.
        </span>
      </div>
    </form>
  );
}
