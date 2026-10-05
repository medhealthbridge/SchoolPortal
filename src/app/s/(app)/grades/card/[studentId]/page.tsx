import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolYears } from "@/db/schema";
import { requireModule, requireUser } from "@/lib/guard";
import { canSeeStudent } from "@/lib/student-access";
import { enabledModules } from "@/lib/tenant";
import { PASSING_SCORE, reportCard } from "@/modules/grades/queries";
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
              card.student.studentNumber,
              "Report card",
              school.name,
              school.address,
              school.phone,
            ]}
          />
        }
        actions={
          card.general !== null ? (
            <Pill tone={passing ? "ok" : "warn"}>
              General average {card.general}
            </Pill>
          ) : null
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
            head={["Subject", ...card.periods.map((p) => p.name), "Average"]}
            minWidth={120 + card.periods.length * 110 + 160}
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
              </tr>
            )}
          </Table>
        )}
      </Section>
    </>
  );
}
