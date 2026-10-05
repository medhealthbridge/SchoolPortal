import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolYears, sections, subjects } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { classScores, currentPeriod, periodsFor } from "@/modules/grades/queries";
import { todayIso } from "@/lib/format";
import { Meta, PageHeader, Section, Segmented, EmptyState } from "@/components/ui";
import { ChevronLeftIcon } from "@/components/icons";
import ScoreSheet from "./sheet";

export const metadata = { title: "Enter scores" };

export default async function ClassScoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ sectionId: string; subjectId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { school } = await requirePermission("grades.enter");
  const { sectionId, subjectId } = await params;
  const sp = await searchParams;

  const data = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    if (!year) return null;

    const [section] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.id, sectionId)))
      .limit(1);
    const [subject] = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.schoolId, school.id), eq(subjects.id, subjectId)))
      .limit(1);
    if (!section || !subject) return null;

    const periods = await periodsFor(tx, school.id, year.id);
    const chosen =
      periods.find((p) => p.id === sp.period) ?? currentPeriod(periods, todayIso());
    const rows = chosen
      ? await classScores(tx, school.id, sectionId, subjectId, chosen.id)
      : [];
    return { section, subject, periods, chosen, rows };
  });

  if (!data) notFound();

  return (
    <>
      <div className="flex items-start gap-1">
        <Link
          href="/grades"
          aria-label="Back to Grades"
          className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink no-underline hover:bg-subtle"
        >
          <ChevronLeftIcon size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={data.subject.name}
            meta={
              <Meta
                items={[
                  `${data.section.level} ${data.section.name}`,
                  data.subject.code,
                  data.chosen?.name ?? "No period",
                ]}
              />
            }
          />
        </div>
      </div>

      {data.periods.length > 1 && (
        <Segmented
          current={data.chosen?.id ?? ""}
          options={data.periods.map((p) => ({
            key: p.id,
            label: p.name,
            href: `/grades/${data.section.id}/${data.subject.id}?period=${p.id}`,
          }))}
        />
      )}

      {!data.chosen ? (
        <Section title="No grading period">
          <EmptyState title="Scores need a period to sit in">
            A school admin adds grading periods on the Grades page.
          </EmptyState>
        </Section>
      ) : data.rows.length === 0 ? (
        <Section title="No students">
          <EmptyState title="Nobody is enrolled in this section yet">
            Import students and enrol them from Setup, and they appear here.
          </EmptyState>
        </Section>
      ) : (
        <ScoreSheet
          subjectId={data.subject.id}
          gradingPeriodId={data.chosen.id}
          periodName={data.chosen.name}
          closed={data.chosen.closedAt !== null}
          rows={data.rows}
        />
      )}
    </>
  );
}
