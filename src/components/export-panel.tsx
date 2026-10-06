import { EXPORTS } from "@/lib/export/datasets";
import { can, type Role } from "@/lib/roles";
import { Button, Field, Input, Section } from "./ui";

const FORMATS = [
  { value: "xlsx", label: "Excel", hint: "opens in Excel and Google Sheets" },
  { value: "pdf", label: "PDF", hint: "for printing or filing" },
  { value: "csv", label: "CSV", hint: "plain text, re-imports as is" },
];

/**
 * Every module's download card. A plain GET form, so it works before the page
 * has hydrated and the browser's own download handling does the rest. The
 * checkboxes only choose; what a role may actually take is decided again in
 * the route.
 */
export function ExportPanel({ dataset, roles }: { dataset: string; roles: Role[] }) {
  const d = EXPORTS[dataset];
  if (!d || !can(roles, d.permission)) return null;
  const mayRestricted = d.restrictedPermission ? can(roles, d.restrictedPermission) : true;
  const columns = d.columns.filter((c) => !c.restricted || mayRestricted);

  return (
    <Section
      id="download"
      title="Download or print"
      subtitle="Tick the columns you need. Choose Excel, PDF or CSV, or a blank template with just the headings to fill in by hand."
    >
      <form method="get" action={`/export/${d.key}`} className="grid gap-5">
        <fieldset className="grid gap-1">
          <legend className="mb-1.5 text-sm font-medium">Columns</legend>
          <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((c) => (
              <label key={c.key} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name="cols"
                  value={c.key}
                  defaultChecked={!c.off}
                  className="size-5 shrink-0"
                />
                <span className="text-sm">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {(d.dateRange || d.withdrawnOption) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {d.dateRange && (
              <>
                <Field label="From">
                  <Input type="date" name="from" />
                </Field>
                <Field label="To">
                  <Input type="date" name="to" />
                </Field>
              </>
            )}
            {d.withdrawnOption && (
              <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
                <input type="checkbox" name="withdrawn" value="1" className="size-5 shrink-0" />
                <span className="text-sm">Include withdrawn students</span>
              </label>
            )}
          </div>
        )}

        <fieldset className="grid gap-1">
          <legend className="mb-1.5 text-sm font-medium">Format</legend>
          <div className="flex flex-wrap gap-x-6">
            {FORMATS.map((f, i) => (
              <label key={f.value} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="format"
                  value={f.value}
                  defaultChecked={i === 0}
                  className="size-5 shrink-0"
                />
                <span className="text-sm">
                  <span className="font-medium">{f.label}</span>{" "}
                  <span className="text-muted">{f.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="blank" value="1" className="size-5 shrink-0" />
          <span className="text-sm">
            <span className="font-medium">Blank template</span>{" "}
            <span className="text-muted">headings only, no rows</span>
          </span>
        </label>

        <div>
          <Button type="submit">Download</Button>
        </div>
      </form>
    </Section>
  );
}
