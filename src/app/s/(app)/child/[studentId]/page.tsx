import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { attendanceRecords, enrollments, schoolYears, sections, students } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { canSeeStudent } from "@/lib/student-access";
import { enabledModules } from "@/lib/tenant";
import { reportCard } from "@/modules/grades/queries";
import { balanceFor } from "@/modules/billing/queries";
import { peso } from "@/lib/pricing";
import { prettyDate } from "@/lib/format";
import {
  CountLegend,
  EmptyState,
  LinkButton,
  Meta,
  PageHeader,
  Pill,
  Section,
  SplitBar,
  StatusBadge,
  Table,
  type Counts,
} from "@/components/ui";

export const metadata = { title: "Student record" };

/**
 * What a parent or a student sees: one page per child, carrying whatever the
 * school has switched on and nothing else. Discipline and guidance never
 * appear here — those offices keep their own records.
 */
export default async function ChildPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { school, session } = await requireUser();
  const { studentId } = await params;
  const on = await enabledModules(school.id);

  const data = await withTenant(school.id, async (tx) => {
    if (!(await canSeeStudent(tx, school.id, session, studentId, "students.view")))
      return null;

    const [student] = await tx
      .select()
      .from(students)
      .where(and(eq(students.schoolId, school.id), eq(students.id, studentId)))
      .limit(1);
    if (!student) return null;

    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);

    const [enrolment] = await tx
      .select({ level: sections.level, name: sections.name })
      .from(enrollments)
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .where(
        and(eq(enrollments.schoolId, school.id), eq(enrollments.studentId, studentId)),
      )
      .limit(1);

    const marks = on.has("attendance")
      ? await tx
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.schoolId, school.id),
              eq(attendanceRecords.studentId, studentId),
            ),
          )
          .orderBy(desc(attendanceRecords.onDate))
          .limit(200)
      : [];

    return {
      student,
      enrolment,
      marks,
      card:
        on.has("grades") && year
          ? await reportCard(tx, school.id, studentId, year.id, {
              attendance: false,
              serviceHours: on.has("sao") || on.has("chaplain"),
            })
          : null,
      balance: on.has("billing") ? await balanceFor(tx, school.id, studentId) : null,
    };
  });

  if (!data) notFound();

  const counts: Counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const m of data.marks) counts[m.status] += 1;
  const marked = data.marks.length;

  return (
    <>
      <PageHeader
        title={`${data.student.firstName} ${data.student.lastName}`}
        meta={
          <Meta
            items={[
              data.student.studentNumber,
              data.enrolment ? `${data.enrolment.level} ${data.enrolment.name}` : null,
            ]}
          />
        }
        actions={
          data.card ? (
            <LinkButton href={`/grades/card/${data.student.id}`} variant="secondary">
              Full report card
            </LinkButton>
          ) : null
        }
      />

      {on.has("attendance") && (
        <Section
          title="Attendance"
          subtitle={
            marked === 0
              ? "Nothing recorded yet this school year."
              : `${marked} marks recorded this school year.`
          }
        >
          {marked === 0 ? (
            <EmptyState title="No marks yet">
              Marks appear the moment a teacher submits a class.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              <SplitBar counts={counts} />
              <CountLegend counts={counts} />
            </div>
          )}
        </Section>
      )}

      {data.card && data.card.lines.length > 0 && (
        <Section
          title="Marks so far"
          subtitle="The average of the periods entered. 75 is the pass mark."
          flush
        >
          <Table head={["Subject", "Average"]} minWidth={320}>
            {data.card.lines.map((l) => (
              <tr key={l.code}>
                <th scope="row" className="text-left font-medium">
                  {l.subject}
                </th>
                <td
                  className="font-semibold"
                  style={
                    l.average !== null && l.average < 75 ? { color: "var(--late-fg)" } : undefined
                  }
                >
                  {l.average ?? "—"}
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {data.balance && (
        <Section
          title="School fees"
          subtitle={
            data.balance.balanceCentavos > 0
              ? "An unpaid balance places a hold on clearance and on records the registrar releases."
              : "Nothing outstanding."
          }
          actions={
            <Pill tone={data.balance.balanceCentavos > 0 ? "warn" : "ok"}>
              {peso(data.balance.balanceCentavos)} outstanding
            </Pill>
          }
        >
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="text-muted">Charged</dt>
              <dd className="text-lg font-semibold">{peso(data.balance.chargedCentavos)}</dd>
            </div>
            <div>
              <dt className="text-muted">Paid</dt>
              <dd className="text-lg font-semibold">{peso(data.balance.paidCentavos)}</dd>
            </div>
          </dl>
        </Section>
      )}

      {on.has("attendance") && data.marks.length > 0 && (
        <Section title="Recent marks" flush>
          <Table head={["Date", "Mark"]} minWidth={320}>
            {data.marks.slice(0, 15).map((m) => (
              <tr key={m.id}>
                <td>{prettyDate(m.onDate)}</td>
                <td>
                  <StatusBadge status={m.status} />
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {on.has("portal") && (
        <p className="text-muted">
          School notices appear on{" "}
          <Link href="/announcements" className="font-medium underline underline-offset-2">
            Announcements
          </Link>
          .
        </p>
      )}
    </>
  );
}
