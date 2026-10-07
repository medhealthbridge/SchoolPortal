import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { sections } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { monthlyReport } from "@/modules/attendance/queries";
import { monthKey } from "@/lib/format";
import {
  Button,
  EmptyState,
  LinkButton,
  Meta,
  PageHeader,
  Section,
  SplitBar,
  STATUS_META,
  STATUS_ORDER,
  StatGrid,
  StatTile,
  Table,
  type Counts,
} from "@/components/ui";
import { DownloadIcon } from "@/components/icons";
import { ExportPanel } from "@/components/export-panel";

export const metadata = { title: "Attendance report" };

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; section?: string }>;
}) {
  const { school, session } = await requirePermission("attendance.view_all");
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

  const totals: Counts = rows.reduce(
    (acc, r) => ({
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      late: acc.late + r.late,
      excused: acc.excused + r.excused,
    }),
    { present: 0, absent: 0, late: 0, excused: 0 },
  );
  const marks = totals.present + totals.absent + totals.late + totals.excused;
  const query = new URLSearchParams({ month, ...(sectionId ? { section: sectionId } : {}) });
  const sectionName = sectionList.find((s) => s.id === sectionId);

  return (
    <>
      <PageHeader
        title="Attendance report"
        meta={
          <Meta
            items={[
              month,
              sectionName ? `${sectionName.level} ${sectionName.name}` : "All sections",
              `${rows.length} students`,
            ]}
          />
        }
        actions={
          rows.length > 0 ? (
            <LinkButton
              href={`/api/attendance/report.csv?${query}`}
              variant="secondary"
              prefetch={false}
            >
              <DownloadIcon />
              Export this month
            </LinkButton>
          ) : null
        }
      />
      <p className="-mt-2 text-sm text-muted">
        For the DepEd form, open the{" "}
        <Link href={`/attendance/sf2?${query}`} className="font-medium text-ink underline underline-offset-2">
          SF2 daily attendance sheet
        </Link>
        .
      </p>

      {marks > 0 && (
        <StatGrid>
          {STATUS_ORDER.map((k) => (
            <StatTile
              key={k}
              label={STATUS_META[k].label}
              value={totals[k].toLocaleString("en-PH")}
              caption={`${((totals[k] / marks) * 100).toFixed(1)}% of ${marks.toLocaleString("en-PH")} marks`}
            />
          ))}
        </StatGrid>
      )}

      {marks > 0 && (
        <Section title="The month at a glance" subtitle="Every mark recorded in this month, in proportion.">
          <SplitBar counts={totals} />
        </Section>
      )}

      <Section title="Pick a month" subtitle="The export carries exactly what is shown here.">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Month</span>
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="h-11 rounded-control border border-line-strong bg-surface px-3 shadow-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Section</span>
            <select
              name="section"
              defaultValue={sectionId ?? ""}
              className="h-11 rounded-control border border-line-strong bg-surface px-3 shadow-control"
            >
              <option value="">All sections</option>
              {sectionList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.level} {s.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Show</Button>
        </form>
      </Section>

      <Section title="By student" flush={rows.length > 0}>
        {rows.length === 0 ? (
          <EmptyState title="Nothing recorded for this month yet">
            Teachers take their classes from{" "}
            <Link href="/attendance" className="font-medium underline underline-offset-2">
              Attendance
            </Link>
            , and every mark lands here.
          </EmptyState>
        ) : (
          <Table head={["Student", "ID", "Present", "Absent", "Late", "Excused"]} minWidth={620}>
            {rows.map((r) => (
              <tr key={r.studentId}>
                <th scope="row" className="text-left font-medium">
                  {r.name}
                </th>
                <td className="text-muted">{r.studentNumber}</td>
                <td>{r.present}</td>
                <td>{r.absent}</td>
                <td>{r.late}</td>
                <td>{r.excused}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <th scope="row" className="text-left">
                Total
              </th>
              <td />
              <td>{totals.present}</td>
              <td>{totals.absent}</td>
              <td>{totals.late}</td>
              <td>{totals.excused}</td>
            </tr>
          </Table>
        )}
      </Section>
      <ExportPanel dataset="attendance" roles={session.roles} />
    </>
  );
}
