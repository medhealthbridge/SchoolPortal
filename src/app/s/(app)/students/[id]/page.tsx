import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { enrollments, schoolYears, sections, students } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { Button, Callout, LinkButton, Meta, PageHeader, Pill, Section } from "@/components/ui";
import { restoreStudent, updateStudent, withdrawStudent } from "../actions";
import { DeleteStudent } from "./delete-student";
import { StudentFields } from "../fields";

export const metadata = { title: "Student record" };

/** The registrar's page for one learner: every field, and the way out. */
export default async function StudentRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { school } = await requirePermission("students.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const data = await withTenant(school.id, async (tx) => {
    const [student] = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.schoolId, school.id)))
      .limit(1);
    if (!student) return null;
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    const [enrolment] = year
      ? await tx
          .select()
          .from(enrollments)
          .where(and(eq(enrollments.studentId, id), eq(enrollments.schoolYearId, year.id)))
          .limit(1)
      : [];
    const sectionList = await tx
      .select()
      .from(sections)
      .where(eq(sections.schoolId, school.id))
      .orderBy(asc(sections.level), asc(sections.name));
    return { student, enrolment, sectionList };
  });
  if (!data) notFound();
  const { student, enrolment, sectionList } = data;
  const away = Boolean(student.archivedAt);

  return (
    <>
      <PageHeader
        title={`${student.lastName}, ${student.firstName}`}
        meta={
          <Meta
            items={[
              `Student no. ${student.studentNumber}`,
              student.lrn ? `LRN ${student.lrn}` : "No LRN yet",
              away ? "Withdrawn" : null,
            ]}
          />
        }
        actions={
          <>
            <LinkButton href="/students" variant="secondary">
              Back to students
            </LinkButton>
            <LinkButton href={`/child/${student.id}`} variant="secondary">
              See what the family sees
            </LinkButton>
          </>
        }
      />

      {away && (
        <Callout tone="warn" title="This student has withdrawn">
          Their marks, grades and fees are kept. They no longer appear on rosters, invoices or
          announcements until you restore them.
        </Callout>
      )}

      <Section
        title="Learner details"
        subtitle="Religion, indigenous group, disability and 4Ps are sensitive. Only the registrar sees them here; teachers' class lists never show them."
      >
        <ActionForm action={updateStudent} submitLabel="Save changes" className="grid gap-6">
          <input type="hidden" name="id" value={student.id} />
          <StudentFields
            student={student}
            sections={sectionList.map((s) => ({ id: s.id, label: `${s.level} ${s.name}` }))}
            sectionId={enrolment?.status === "active" ? enrolment.sectionId : undefined}
          />
        </ActionForm>
      </Section>

      <Section title="Account">
        <p className="text-sm">
          {student.claimedAt ? (
            <Pill tone="ok">Claimed</Pill>
          ) : (
            <>
              <Pill>Not claimed</Pill>{" "}
              <span className="font-mono tracking-[0.06em]">{student.activationCode}</span> is the
              student's activation code.
            </>
          )}{" "}
          Parent code{" "}
          <span className="font-mono tracking-[0.06em]">{student.parentCode}</span>.
        </p>
      </Section>

      <Section
        title={away ? "Restore" : "Withdraw or delete"}
        subtitle={
          away
            ? "Putting them back returns them to the section they left."
            : "Withdrawing keeps everything on file. Deleting is for a record entered by mistake."
        }
      >
        <div className="flex flex-wrap items-start gap-3">
          {away ? (
            <form action={restoreStudent}>
              <input type="hidden" name="id" value={student.id} />
              <Button type="submit">Restore student</Button>
            </form>
          ) : (
            <form action={withdrawStudent}>
              <input type="hidden" name="id" value={student.id} />
              <Button type="submit" variant="secondary">
                Withdraw student
              </Button>
            </form>
          )}
        </div>
        {!away && (
          <div className="mt-4 max-w-md">
            <DeleteStudent id={student.id} name={`${student.firstName} ${student.lastName}`} />
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          A student with marks, grades, fees or discipline records cannot be deleted. Withdraw
          them instead. <Link href="/students" className="underline underline-offset-2">Back to the list</Link>
        </p>
      </Section>
    </>
  );
}
