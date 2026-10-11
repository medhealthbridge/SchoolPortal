import Link from "next/link";
import { and, avg, count, eq, gte, lte, ne, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  attendanceRecords,
  guidanceCases,
  incidents,
  registrarRequests,
  schoolYears,
  scores,
  serviceHours,
  students,
} from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { enabledModules } from "@/lib/tenant";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { studentsOwing } from "@/modules/billing/queries";
import { PASSING_SCORE, currentPeriod, periodsFor } from "@/modules/grades/queries";
import { peso } from "@/lib/pricing";
import { monthKey, todayIso } from "@/lib/format";
import {
  CountLegend,
  EmptyState,
  LinkButton,
  PageHeader,
  Pill,
  Section,
  SplitBar,
  StatGrid,
  StatTile,
  type Counts,
} from "@/components/ui";

export const metadata = { title: "Analytics" };

/**
 * The principal's one page. It reads whichever modules are on and says
 * plainly which ones are not, so a thin dashboard is never mistaken for a
 * quiet school.
 */
export default async function AnalyticsPage() {
  const { school } = await requirePermission("analytics.view");
  const on = await enabledModules(school.id);
  const month = monthKey();
  const from = `${month}-01`;
  const to = todayIso();

  const data = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);

    const enrolled = Number(
      (
        await tx.select({ n: count() }).from(students).where(eq(students.schoolId, school.id))
      )[0]?.n ?? 0,
    );

    let attendance: Counts | null = null;
    if (on.has("attendance")) {
      const rows = await tx
        .select({ status: attendanceRecords.status, n: count() })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.schoolId, school.id),
            gte(attendanceRecords.onDate, from),
            lte(attendanceRecords.onDate, to),
          ),
        )
        .groupBy(attendanceRecords.status);
      attendance = { present: 0, absent: 0, late: 0, excused: 0 };
      for (const r of rows) attendance[r.status] = Number(r.n);
    }

    let grades: { mean: number | null; failing: number; period: string } | null = null;
    if (on.has("grades") && year) {
      const periods = await periodsFor(tx, school.id, year.id);
      const now = currentPeriod(periods, to);
      if (now) {
        const [agg] = await tx
          .select({ mean: avg(scores.score) })
          .from(scores)
          .where(
            and(eq(scores.schoolId, school.id), eq(scores.gradingPeriodId, now.id)),
          );
        const [fail] = await tx
          .select({ n: count() })
          .from(scores)
          .where(
            and(
              eq(scores.schoolId, school.id),
              eq(scores.gradingPeriodId, now.id),
              lte(scores.score, PASSING_SCORE - 1),
            ),
          );
        grades = {
          mean: agg?.mean ? Math.round(Number(agg.mean)) : null,
          failing: Number(fail?.n ?? 0),
          period: now.name,
        };
      }
    }

    return {
      enrolled,
      attendance,
      grades,
      openIncidents: on.has("discipline")
        ? Number(
            (
              await tx
                .select({ n: count() })
                .from(incidents)
                .where(
                  and(
                    eq(incidents.schoolId, school.id),
                    ne(incidents.status, "resolved"),
                  ),
                )
            )[0]?.n ?? 0,
          )
        : null,
      openCases: on.has("guidance")
        ? Number(
            (
              await tx
                .select({ n: count() })
                .from(guidanceCases)
                .where(
                  and(
                    eq(guidanceCases.schoolId, school.id),
                    eq(guidanceCases.status, "open"),
                  ),
                )
            )[0]?.n ?? 0,
          )
        : null,
      owing: on.has("billing") ? await studentsOwing(tx, school.id) : null,
      holds: on.has("registrar")
        ? Number(
            (
              await tx
                .select({ n: count() })
                .from(registrarRequests)
                .where(
                  and(
                    eq(registrarRequests.schoolId, school.id),
                    eq(registrarRequests.status, "on_hold"),
                  ),
                )
            )[0]?.n ?? 0,
          )
        : null,
      hours:
        on.has("sao") || on.has("chaplain")
          ? Number(
              (
                await tx
                  .select({ total: sql<number>`coalesce(sum(${serviceHours.hours}), 0)` })
                  .from(serviceHours)
                  .where(eq(serviceHours.schoolId, school.id))
              )[0]?.total ?? 0,
            )
          : null,
    };
  });

  const marked = data.attendance
    ? data.attendance.present + data.attendance.absent + data.attendance.late + data.attendance.excused
    : 0;
  const rate =
    data.attendance && marked > 0
      ? ((data.attendance.present + data.attendance.late) / marked) * 100
      : null;

  const off = (["attendance", "grades", "discipline", "guidance", "billing", "registrar"] as ModuleKey[])
    .filter((k) => !on.has(k));

  return (
    <>
      <PageHeader
        title="Analytics"
        meta={`${data.enrolled.toLocaleString("en-PH")} students enrolled · ${month}`}
      />

      <StatGrid>
        {rate !== null && (
          <StatTile
            label="Attendance rate"
            value={`${rate.toFixed(1)}%`}
            caption={`Present or late, across ${marked.toLocaleString("en-PH")} marks this month`}
          />
        )}
        {data.grades && (
          <StatTile
            label="Average mark"
            value={data.grades.mean ?? "—"}
            caption={`${data.grades.period}, across every subject entered`}
          />
        )}
        {data.grades && (
          <StatTile
            label="Below 75"
            value={data.grades.failing}
            caption="Guidance is told about each one"
            pill={data.grades.failing > 0 ? <Pill tone="warn">Watch</Pill> : null}
          />
        )}
        {data.openIncidents !== null && (
          <StatTile
            label="Open incidents"
            value={data.openIncidents}
            caption="Reported, not yet resolved"
          />
        )}
        {data.openCases !== null && (
          <StatTile
            label="Guidance caseload"
            value={data.openCases}
            caption="Counts only; the records stay in that office"
          />
        )}
        {data.owing && (
          <StatTile
            label="Fees outstanding"
            value={peso(data.owing.reduce((n, r) => n + r.balanceCentavos, 0))}
            caption={`${data.owing.length} students with a balance`}
          />
        )}
        {data.holds !== null && (
          <StatTile
            label="Clearance holds"
            value={data.holds}
            caption="Requests waiting on another office"
          />
        )}
        {data.hours !== null && (
          <StatTile
            label="Service hours"
            value={data.hours.toLocaleString("en-PH")}
            caption="Logged by SAO and the chaplain"
          />
        )}
      </StatGrid>

      {data.attendance && marked > 0 && (
        <Section title="This month's marks" subtitle="Every mark recorded since the 1st.">
          <div className="flex flex-col gap-4">
            <SplitBar counts={data.attendance} />
            <CountLegend counts={data.attendance} />
          </div>
        </Section>
      )}

      {data.owing && data.owing.length > 0 && (
        <Section
          title="Largest balances"
          subtitle="Each one holds that student's clearance until it is settled."
        >
          <ul className="-mx-1">
            {data.owing.slice(0, 5).map((r, i) => (
              <li
                key={r.studentId}
                className={`flex items-center justify-between gap-4 px-1 py-2.5 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <Link href={`/child/${r.studentId}`} className="min-w-0 truncate font-medium">
                  {r.name}
                </Link>
                <span className="shrink-0 font-semibold" style={{ color: "var(--late-fg)" }}>
                  {peso(r.balanceCentavos)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {off.length > 0 && (
        <Section title="Not measured here">
          <EmptyState title={`${off.map((k) => MODULES[k].name).join(", ")} ${off.length === 1 ? "is" : "are"} switched off`}>
            Nothing above counts them, so a low number is not a quiet school.{" "}
            <Link href="/modules" className="font-medium underline underline-offset-2">
              Switch one on
            </Link>{" "}
            and it appears here from that day.
          </EmptyState>
        </Section>
      )}

      {marked === 0 && !data.grades && (
        <Section title="Nothing to show yet">
          <EmptyState title="No marks or scores this month">
            The dashboard fills as teachers submit classes and enter grades.
          </EmptyState>
          <div className="mt-4">
            <LinkButton href="/attendance/report" variant="secondary">
              Open the attendance report
            </LinkButton>
          </div>
        </Section>
      )}
    </>
  );
}
