import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { sections } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { monthlyReport } from "@/modules/attendance/queries";
import { monthKey } from "@/lib/format";
import { Section, Table } from "@/components/ui";

export const metadata = { title: "Attendance report" };

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; section?: string }>;
}) {
  const { school } = await requirePermission("attendance.view_all");
  const sp = await searchParams;
  const month = sp.month ?? monthKey();
  const sectionId = sp.section || undefined;

  const { rows, sectionList } = await withTenant(school.id, async (tx) => ({
    rows: await monthlyReport(tx, school.id, month, sectionId),
    sectionList: await tx
      .select({ id: sections.id, level: sections.level, name: sections.name })
      .from(sections)
      .where(eq(sections.schoolId, school.id))
      .orderBy(asc(sections.level), asc(sections.name)),
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      late: acc.late + r.late,
      excused: acc.excused + r.excused,
    }),
    { present: 0, absent: 0, late: 0, excused: 0 },
  );

  const query = new URLSearchParams({ month, ...(sectionId ? { section: sectionId } : {}) });

  return (
    <div className="grid gap-5">
      <Section
        title="Monthly attendance"
        subtitle={`${rows.length} students, ${month}`}
        actions={
          <a
            href={`/api/attendance/report.csv?${query}`}
            className="brand-text text-sm font-medium underline"
          >
            Export CSV
          </a>
        }
      >
        <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Month</span>
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-[2px] border border-[var(--rule)] border-b-2 border-b-[var(--ink-soft)] bg-[var(--paper-raised)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Section</span>
            <select
              name="section"
              defaultValue={sectionId ?? ""}
              className="rounded-[2px] border border-[var(--rule)] border-b-2 border-b-[var(--ink-soft)] bg-[var(--paper-raised)] px-3 py-2 text-sm"
            >
              <option value="">All sections</option>
              {sectionList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.level} {s.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-[2px] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white">
            Show
          </button>
        </form>

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            Nothing recorded for this month yet. Teachers take their classes
            from{" "}
            <Link href="/attendance" className="font-medium text-[var(--brand)] underline underline-offset-2">
              Take attendance
            </Link>
            .
          </p>
        ) : (
          <Table head={["Student", "ID", "Present", "Absent", "Late", "Excused"]}>
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className="py-2 pr-5 font-medium">{r.name}</td>
                <td className="py-2 pr-5 tabular-nums">{r.studentNumber}</td>
                <td className="py-2 pr-5 tabular-nums">{r.present}</td>
                <td className="py-2 pr-5 tabular-nums">{r.absent}</td>
                <td className="py-2 pr-5 tabular-nums">{r.late}</td>
                <td className="py-2 pr-5 tabular-nums">{r.excused}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-5">Total</td>
              <td />
              <td className="py-2 pr-5 tabular-nums">{totals.present}</td>
              <td className="py-2 pr-5 tabular-nums">{totals.absent}</td>
              <td className="py-2 pr-5 tabular-nums">{totals.late}</td>
              <td className="py-2 pr-5 tabular-nums">{totals.excused}</td>
            </tr>
          </Table>
        )}
      </Section>
    </div>
  );
}
