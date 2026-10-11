import { withTenant } from "@/db";
import { requireModule, requireUser } from "@/lib/guard";
import { monthKey } from "@/lib/format";
import { sf2 } from "@/modules/attendance/sf2";
import { sf2Sections } from "@/modules/attendance/sf2-access";
import { Button, EmptyState, Meta, PageHeader, Section, Select, Table } from "@/components/ui";

export const metadata = { title: "SF2 daily attendance" };

export default async function Sf2Page({ searchParams }: { searchParams: Promise<{ section?: string; month?: string }> }) {
  await requireModule("attendance");
  const { school, session } = await requireUser();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : monthKey();

  const { allowed, sheet } = await withTenant(school.id, async (tx) => {
    const allowed = await sf2Sections(tx, school.id, session);
    const chosen = allowed.find((s) => s.id === sp.section) ?? allowed[0];
    return { allowed, sheet: chosen ? await sf2(tx, school.id, chosen.id, month) : null };
  });

  const q = sheet ? new URLSearchParams({ section: sheet.section.id, month }).toString() : "";
  return (
    <>
      <PageHeader
        title="SF2 daily attendance"
        meta={<Meta items={["School Form 2", month, sheet ? `${sheet.section.level} ${sheet.section.name}` : null]} />}
      />
      <Section>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
            Section
            <Select name="section" defaultValue={sheet?.section.id}>
              {allowed.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Month
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="h-11 rounded-control border border-line-strong bg-surface px-3 shadow-control"
            />
          </label>
          <Button type="submit" variant="secondary">
            Show
          </Button>
        </form>
      </Section>
      {!sheet ? (
        <Section>
          <EmptyState title="No section to show">
            SF2 is kept for a section you advise or teach. The office sees every section.
          </EmptyState>
        </Section>
      ) : (
        <Section
          title={`${sheet.rows.length} learners, ${sheet.days.length} school days`}
          subtitle="Read from the class marks: A only when absent from every class that day, L when late to any. Blank means no class was marked."
          flush={sheet.rows.length > 0}
          actions={
            <span className="flex flex-wrap gap-2">
              <a href={`/attendance/sf2/download?${q}&format=xlsx`} className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-3 text-sm font-medium text-ink no-underline shadow-control hover:bg-subtle">
                Excel
              </a>
              <a href={`/attendance/sf2/download?${q}&format=pdf`} className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-3 text-sm font-medium text-ink no-underline shadow-control hover:bg-subtle">
                PDF
              </a>
            </span>
          }
        >
          {sheet.rows.length === 0 ? (
            <EmptyState title="Nobody is enrolled in this section">Enrol learners from Students.</EmptyState>
          ) : (
            <Table head={["Learner", ...sheet.days.map((d) => String(Number(d.slice(8)))), "Absent", "Tardy"]} minWidth={240 + sheet.days.length * 34 + 140}>
              {sheet.rows.map((r) => (
                <tr key={r.studentId}>
                  <th scope="row" className="text-left font-medium">
                    {r.name}
                    {r.lrn && <span className="block text-[13px] font-normal text-muted">{r.lrn}</span>}
                  </th>
                  {r.days.map((m, i) => (
                    <td
                      key={i}
                      className="text-center"
                      style={
                        m === "A"
                          ? { color: "var(--absent-fg)" }
                          : m === "L"
                            ? { color: "var(--late-fg)" }
                            : m === "E"
                              ? { color: "var(--excused-fg)" }
                              : undefined
                      }
                    >
                      {m}
                    </td>
                  ))}
                  <td>{r.absent}</td>
                  <td>{r.tardy}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}
    </>
  );
}
