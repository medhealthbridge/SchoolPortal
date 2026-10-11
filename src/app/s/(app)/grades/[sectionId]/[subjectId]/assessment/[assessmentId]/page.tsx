import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { assessments, gradingPeriods, sections, subjects } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { classRecord, mayKeepRecord } from "@/modules/grades/class-record";
import { COMPONENT_LABEL } from "@/modules/grades/deped";
import { Meta, PageHeader, Section, EmptyState } from "@/components/ui";
import { ChevronLeftIcon } from "@/components/icons";
import RawSheet from "./raw-sheet";

export const metadata = { title: "Enter raw scores" };

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ sectionId: string; subjectId: string; assessmentId: string }>;
}) {
  const { school, session } = await requirePermission("grades.enter");
  const { sectionId, subjectId, assessmentId } = await params;

  const data = await withTenant(school.id, async (tx) => {
    const [a] = await tx
      .select()
      .from(assessments)
      .where(
        and(
          eq(assessments.schoolId, school.id),
          eq(assessments.id, assessmentId),
          eq(assessments.sectionId, sectionId),
          eq(assessments.subjectId, subjectId),
        ),
      )
      .limit(1);
    if (!a || !(await mayKeepRecord(tx, school.id, session, sectionId, subjectId))) return null;
    const [period] = await tx.select().from(gradingPeriods).where(eq(gradingPeriods.id, a.gradingPeriodId)).limit(1);
    const [section] = await tx.select().from(sections).where(eq(sections.id, sectionId)).limit(1);
    const [subject] = await tx.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
    const record = await classRecord(tx, school.id, sectionId, subjectId, a.gradingPeriodId);
    return { a, period, section, subject, rows: record.rows };
  });
  if (!data) notFound();

  const back = `/grades/${sectionId}/${subjectId}?period=${data.a.gradingPeriodId}`;
  return (
    <>
      <div className="flex items-start gap-1">
        <Link
          href={back}
          aria-label="Back to the class record"
          className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink no-underline hover:bg-subtle"
        >
          <ChevronLeftIcon size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={data.a.title}
            meta={
              <Meta
                items={[
                  COMPONENT_LABEL[data.a.component],
                  `${data.subject?.name ?? ""} · ${data.section?.level ?? ""} ${data.section?.name ?? ""}`,
                  data.period?.name,
                ]}
              />
            }
          />
        </div>
      </div>
      {data.rows.length === 0 ? (
        <Section title="No students">
          <EmptyState title="Nobody is enrolled in this section yet">
            Enrol students from Students, and they appear here.
          </EmptyState>
        </Section>
      ) : (
        <RawSheet
          assessmentId={data.a.id}
          title={data.a.title}
          highest={data.a.highestScore}
          closed={data.period?.closedAt != null}
          rows={data.rows.map((r) => ({
            studentId: r.studentId,
            studentNumber: r.studentNumber,
            name: r.name,
            raw: r.raw.get(data.a.id) ?? null,
          }))}
        />
      )}
    </>
  );
}
