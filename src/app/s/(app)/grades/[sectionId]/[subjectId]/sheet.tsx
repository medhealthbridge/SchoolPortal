"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, Callout, Pill, Section } from "@/components/ui";
import { saveClassScores } from "../../actions";

type Row = { studentId: string; studentNumber: string; name: string; score: number | null };
type Result = { ok?: string; error?: string; issues?: string[] } | null;

const PASSING = 75;

export default function ScoreSheet({
  subjectId,
  gradingPeriodId,
  periodName,
  closed,
  rows,
}: {
  subjectId: string;
  gradingPeriodId: string;
  periodName: string;
  closed: boolean;
  rows: Row[];
}) {
  const [state, action, pending] = useActionState<Result, FormData>(saveClassScores, null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.studentId, r.score === null ? "" : String(r.score)])),
  );

  const stats = useMemo(() => {
    const nums = Object.values(values)
      .filter((v) => v.trim() !== "")
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
    const failing = nums.filter((n) => n < PASSING).length;
    return {
      entered: nums.length,
      mean: nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null,
      failing,
    };
  }, [values]);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="gradingPeriodId" value={gradingPeriodId} />

      {closed && (
        <Callout tone="warn" title={`${periodName} is closed`}>
          Scores are frozen. A school admin reopens the period on the Grades page.
        </Callout>
      )}
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
        subtitle="Leave a box empty for a student you have not graded yet. 75 is the pass mark."
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Pill>{stats.entered} entered</Pill>
            {stats.mean !== null && <Pill>Average {stats.mean}</Pill>}
            {stats.failing > 0 && <Pill tone="warn">{stats.failing} below 75</Pill>}
          </span>
        }
      >
        <ul className="-mx-1">
          {rows.map((r, i) => {
            const raw = values[r.studentId] ?? "";
            const n = Number(raw);
            const bad = raw !== "" && (!Number.isInteger(n) || n < 0 || n > 100);
            const failing = raw !== "" && !bad && n < PASSING;
            return (
              <li
                key={r.studentId}
                className={`flex min-h-[60px] items-center gap-3 px-1 py-2 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <label htmlFor={`score-${r.studentId}`} className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-tight">{r.name}</span>
                  <span className="block truncate text-[13px] leading-tight text-muted">
                    {r.studentNumber}
                  </span>
                </label>
                <input
                  id={`score-${r.studentId}`}
                  name={`score:${r.studentId}`}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={closed}
                  value={raw}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [r.studentId]: e.target.value }))
                  }
                  aria-invalid={bad || undefined}
                  className="h-11 w-20 shrink-0 rounded-control border bg-surface text-center font-medium shadow-control disabled:opacity-50"
                  style={{
                    borderColor: bad
                      ? "var(--absent-solid)"
                      : failing
                        ? "var(--late-line)"
                        : "var(--line-strong)",
                    background: failing && !bad ? "var(--late-bg)" : undefined,
                    color: bad ? "var(--danger)" : failing ? "var(--late-fg)" : undefined,
                  }}
                />
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="sticky bottom-[68px] z-10 -mx-[var(--gutter)] flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-[var(--gutter)] py-3 lg:bottom-0 lg:mx-0 lg:rounded-card lg:border lg:shadow-card">
        <span className="text-muted">
          {stats.entered} of {rows.length} graded for {periodName}.
        </span>
        <Button type="submit" size="lg" disabled={pending || closed}>
          {pending ? "Saving" : "Save scores"}
        </Button>
      </div>
    </form>
  );
}
