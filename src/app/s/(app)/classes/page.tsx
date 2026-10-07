import Link from "next/link";
import { and, count, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import { enrollments, studentGuardians } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { sectionsOfTeacher } from "@/lib/schedule";
import { ArrowRightIcon } from "@/components/icons";
import { EmptyState, Meta, PageHeader, Pill, Section } from "@/components/ui";

export const metadata = { title: "My classes" };

/** The sections a teacher meets, with how many families are linked so far. */
export default async function ClassesPage() {
  const { school, session } = await requirePermission("attendance.take");
  const list = await withTenant(school.id, async (tx) => {
    const mine = await sectionsOfTeacher(tx, school.id, session.userId);
    if (mine.length === 0) return [];
    const ids = mine.map((s) => s.id);
    const sizes = await tx
      .select({ sectionId: enrollments.sectionId, n: count() })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.schoolId, school.id),
          inArray(enrollments.sectionId, ids),
          eq(enrollments.status, "active"),
        ),
      )
      .groupBy(enrollments.sectionId);
    const families = await tx
      .selectDistinct({ sectionId: enrollments.sectionId, studentId: enrollments.studentId })
      .from(enrollments)
      .innerJoin(studentGuardians, eq(studentGuardians.studentId, enrollments.studentId))
      .where(
        and(
          eq(enrollments.schoolId, school.id),
          inArray(enrollments.sectionId, ids),
          eq(enrollments.status, "active"),
        ),
      );
    return mine.map((s) => ({
      ...s,
      students: Number(sizes.find((z) => z.sectionId === s.id)?.n ?? 0),
      linked: families.filter((f) => f.sectionId === s.id).length,
    }));
  });

  return (
    <>
      <PageHeader
        title="My classes"
        meta="The sections you teach or advise. Open one to see the class list and invite parents."
      />
      <Section title="Sections">
        {list.length === 0 ? (
          <EmptyState title="No classes yet">
            When the registrar or the principal puts you on the schedule, your sections appear
            here.
          </EmptyState>
        ) : (
          <ul className="-mx-1">
            {list.map((s, i) => (
              <li key={s.id} className={i > 0 ? "border-t border-line" : ""}>
                <Link
                  href={`/classes/${s.id}`}
                  className="flex min-h-[60px] items-center justify-between gap-4 px-1 py-2.5 no-underline hover:bg-subtle"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {s.label}
                      {s.advises && <Pill>Your advisory</Pill>}
                    </span>
                    <Meta
                      items={[
                        `${s.students} ${s.students === 1 ? "student" : "students"}`,
                        `${s.linked} with a parent linked`,
                      ]}
                    />
                  </span>
                  <ArrowRightIcon className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
