import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolYears } from "@/db/schema";
import { requireModule, requireUser } from "@/lib/guard";
import { canSeeStudent } from "@/lib/student-access";
import { enabledModules } from "@/lib/tenant";
import { PASSING_SCORE, reportCard } from "@/modules/grades/queries";
import { DESCRIPTORS, descriptor } from "@/modules/grades/deped";
import {
  EmptyState,
  Meta,
  PageHeader,
  Pill,
  Section,
  StatGrid,
  StatTile,
  Table,
} from "@/components/ui";

export const metadata = { title: "Report card" };

export default async function ReportCardPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requireModule("grades");
  const { school, session } = await requireUser();
  const { studentId } = await params;
  const on = await enabledModules(school.id);

  const card = await withTenant(school.id, async (tx) => {
    if (!(await canSeeStudent(tx, school.id, session, studentId, "grades.view_all")))
      return null;
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    if (!year) return null;
    return reportCard(tx, school.id, studentId, year.id, {
      attendance: on.has("attendance"),
      serviceHours: on.has("sao") || on.has("chaplain"),
    });
  });

  if (!card) notFound();

  const passing = card.general !== null && card.general >= PASSING_SCORE;

  return (
    <>
      <PageHeader
        title={`${card.student.firstName} ${card.student.lastName}`}
        meta={
          <Meta
            items={[
              card.student.lrn ? `LRN ${card.student.lrn}` : card.student.studentNumber,
              "Report card (SF9)",
              school.name,
              school.address,
              school.phone,
            ]}
          />
        }
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {card.general !== null && (
              <Pill tone={passing ? "ok" : "warn"}>
                General average {card.general} · {descriptor(card.general)}
              </Pill>
            )}
            <a
              href={`/grades/card/${card.student.id}/sf9`}
              className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium text-ink no-underline shadow-control hover:bg-subtle"
            >
              Download SF9 (PDF)
            </a>
          </span>
        }
      />

      {(card.attendance || card.serviceHours !== null) && (
        <StatGrid>
          {card.attendance && (
            <>
              <StatTile label="Present" value={card.attendance.present} caption="Marks this year" />
              <StatTile label="Absent" value={card.attendance.absent} caption="Marks this year" />
              <StatTile label="Late" value={card.attendance.late} caption="Marks this year" />
            </>
          )}
          {card.serviceHours !== null && (
            <StatTile
              label="Service hours"
              value={card.serviceHours}
              caption="From clubs, events and ministry"
            />
          )}
        </StatGrid>
      )}

      <Section
        title="Marks by subject"
        subtitle="A subject's average is the mean of the periods entered so far. The pass mark is 75."
        flush={card.lines.length > 0}
      >
        {card.lines.length === 0 ? (
          <EmptyState title="No marks yet this school year">
            Scores appear here as teachers enter them, period by period.
          </EmptyState>
        ) : (
          <Table
            head={["Subject", ...card.periods.map((p) => p.name), "Average", "Remarks"]}
            minWidth={120 + card.periods.length * 110 + 300}
          >
            {card.lines.map((line) => (
              <tr key={line.code}>
                <th scope="row" className="text-left font-medium">
                  {line.subject}
                  <span className="block text-[13px] font-normal text-muted">{line.code}</span>
                </th>
                {line.byPeriod.map((v, i) => (
                  <td
                    key={i}
                    style={v !== null && v < PASSING_SCORE ? { color: "var(--late-fg)" } : undefined}
                  >
                    {v ?? "—"}
                  </td>
                ))}
                <td
                  className="font-semibold"
                  style={
                    line.average !== null && line.average < PASSING_SCORE
                      ? { color: "var(--late-fg)" }
                      : undefined
                  }
                >
                  {line.average ?? "—"}
                </td>
                <td className="text-muted">
                  {line.average === null ? "—" : line.average >= PASSING_SCORE ? "Passed" : "Failed"}
                </td>
              </tr>
            ))}
            {card.general !== null && (
              <tr className="font-semibold">
                <th scope="row" className="text-left">
                  General average
                </th>
                {card.periods.map((_, i) => (
                  <td key={i} />
                ))}
                <td>{card.general}</td>
                <td className="text-muted">{descriptor(card.general)}</td>
              </tr>
            )}
          </Table>
        )}
      </Section>

      <Section title="Descriptors" subtitle="How DepEd describes a grade on the report card.">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {DESCRIPTORS.map((d) => (
            <div key={d.label} className="flex justify-between gap-3 border-b border-line py-1">
              <dt>{d.label}</dt>
              <dd className="text-muted">{d.range}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}
