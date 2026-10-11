"use client";

import { useActionState, useState } from "react";
import { Button, Callout, Pill, Section } from "@/components/ui";
import { saveRawScores } from "../../../../record-actions";

type Row = { studentId: string; studentNumber: string; name: string; raw: number | null };
type Result = { ok?: string; error?: string; issues?: string[] } | null;

export default function RawSheet({
  assessmentId,
  title,
  highest,
  closed,
  rows,
}: {
  assessmentId: string;
  title: string;
  highest: number;
  closed: boolean;
  rows: Row[];
}) {
  const [state, action, pending] = useActionState<Result, FormData>(saveRawScores, null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.studentId, r.raw === null ? "" : String(r.raw)])),
  );
  const entered = Object.values(values).filter((v) => v.trim() !== "").length;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      {state?.error && (
        <Callout tone="danger" title={state.error}>
          {state.issues && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {state.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </Callout>
      )}
      {state?.ok && <Callout tone="ok">{state.ok}</Callout>}
      <Section
        title={`${rows.length} students`}
        subtitle={`Raw scores out of ${highest}. Leave a box empty for a learner who has not taken it yet; it counts as 0 in the record.`}
        actions={<Pill>{entered} entered</Pill>}
      >
        <ul className="-mx-1">
          {rows.map((r, i) => {
            const raw = values[r.studentId] ?? "";
            const n = Number(raw);
            const bad = raw !== "" && (!Number.isFinite(n) || n < 0 || n > highest);
            return (
              <li
                key={r.studentId}
                className={`flex min-h-[60px] items-center gap-3 px-1 py-2 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <label htmlFor={`raw-${r.studentId}`} className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-tight">{r.name}</span>
                  <span className="block truncate text-[13px] leading-tight text-muted">{r.studentNumber}</span>
                </label>
                <input
                  id={`raw-${r.studentId}`}
                  name={`raw:${r.studentId}`}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={closed}
                  value={raw}
                  onChange={(e) => setValues((prev) => ({ ...prev, [r.studentId]: e.target.value }))}
                  aria-invalid={bad || undefined}
                  className="h-11 w-20 shrink-0 rounded-control border bg-surface text-center font-medium shadow-control disabled:opacity-50"
                  style={{
                    borderColor: bad ? "var(--absent-solid)" : "var(--line-strong)",
                    color: bad ? "var(--danger)" : undefined,
                  }}
                />
              </li>
            );
          })}
        </ul>
      </Section>
      <div className="sticky bottom-[68px] z-10 -mx-[var(--gutter)] flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-[var(--gutter)] py-3 lg:bottom-0 lg:mx-0 lg:rounded-card lg:border lg:shadow-card">
        <span className="text-muted">
          {entered} of {rows.length} entered for {title}.
        </span>
        <Button type="submit" size="lg" disabled={pending || closed}>
          {pending ? "Saving" : "Save scores"}
        </Button>
      </div>
    </form>
  );
}
