import { notFound } from "next/navigation";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  enrollments,
  guardianInvites,
  sections,
  studentGuardians,
  students,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { permissionsFor } from "@/lib/roles";
import { sectionsOfTeacher } from "@/lib/schedule";
import { InviteParentForm } from "@/components/invite-parent";
import { Button, EmptyState, Meta, PageHeader, Pill, Section } from "@/components/ui";
import { cancelParentInvite } from "../actions";

export const metadata = { title: "Class list" };

/**
 * One section's students and their families: who is linked, who has an invite
 * waiting, and a form to invite the rest.
 */
export default async function ClassListPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { school, session } = await requirePermission("attendance.take");
  const { sectionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) notFound();
  const perms = permissionsFor(session.roles);

  const data = await withTenant(school.id, async (tx) => {
    const office = perms.has("students.manage") || perms.has("staff.manage");
    const mine = await sectionsOfTeacher(tx, school.id, session.userId);
    const own = mine.find((s) => s.id === sectionId);
    if (!own && !office) return null;

    const [section] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.id, sectionId)))
      .limit(1);
    if (!section) return null;

    const roster = await tx
      .select({ id: students.id, number: students.studentNumber, first: students.firstName, last: students.lastName })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(
        and(
          eq(enrollments.schoolId, school.id),
          eq(enrollments.sectionId, sectionId),
          eq(enrollments.status, "active"),
          isNull(students.archivedAt),
        ),
      )
      .orderBy(asc(students.lastName), asc(students.firstName));
    const ids = roster.map((r) => r.id);
    const parents = ids.length
      ? await tx
          .select({
            studentId: studentGuardians.studentId,
            name: users.name,
            relationship: studentGuardians.relationship,
          })
          .from(studentGuardians)
          .innerJoin(users, eq(users.id, studentGuardians.guardianUserId))
          .where(and(eq(studentGuardians.schoolId, school.id), inArray(studentGuardians.studentId, ids)))
      : [];
    const waiting = ids.length
      ? await tx
          .select()
          .from(guardianInvites)
          .where(
            and(
              eq(guardianInvites.schoolId, school.id),
              inArray(guardianInvites.studentId, ids),
              isNull(guardianInvites.acceptedAt),
              gt(guardianInvites.expiresAt, new Date()),
            ),
          )
      : [];
    return { section, advises: own?.advises ?? false, roster, parents, waiting };
  });
  if (!data) notFound();

  const linkedCount = new Set(data.parents.map((p) => p.studentId)).size;

  return (
    <>
      <PageHeader
        title={`${data.section.level} ${data.section.name}`}
        meta={
          <Meta
            items={[
              `${data.roster.length} students`,
              `${linkedCount} with a parent linked`,
              data.waiting.length ? `${data.waiting.length} invites waiting` : null,
              data.advises ? "Your advisory" : null,
            ]}
          />
        }
        actions={
          <a
            href={`/attendance/sf2?section=${data.section.id}`}
            className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium text-ink no-underline shadow-control hover:bg-subtle"
          >
            SF2 daily attendance
          </a>
        }
      />
      <Section
        title="Students and their families"
        subtitle="Invite a parent and they see this child's grades, attendance, schedule and school news. A parent with two children here uses one account for both."
      >
        {data.roster.length === 0 ? (
          <EmptyState title="No students in this section yet">
            The registrar places students in sections.
          </EmptyState>
        ) : (
          <ul className="-mx-1">
            {data.roster.map((s, i) => {
              const theirs = data.parents.filter((p) => p.studentId === s.id);
              const pending = data.waiting.filter((w) => w.studentId === s.id);
              return (
                <li key={s.id} className={`px-1 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {s.last}, {s.first}
                      </span>
                      <span className="block text-[13px] text-muted">{s.number}</span>
                    </span>
                    {theirs.length > 0 ? (
                      <Pill tone="ok">
                        {theirs.map((p) => `${p.name} (${p.relationship})`).join(", ")}
                      </Pill>
                    ) : pending.length > 0 ? (
                      <Pill tone="warn">Invite waiting</Pill>
                    ) : (
                      <Pill>No parent yet</Pill>
                    )}
                  </div>
                  {pending.map((w) => (
                    <div key={w.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
                      <span>
                        Waiting: {w.name}, {w.email}
                      </span>
                      <form action={cancelParentInvite}>
                        <input type="hidden" name="id" value={w.id} />
                        <Button type="submit" variant="ghost">
                          Cancel invite
                        </Button>
                      </form>
                    </div>
                  ))}
                  <details className="mt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium underline underline-offset-2">
                      {theirs.length > 0 || pending.length > 0 ? "Invite another parent" : "Invite a parent"}
                    </summary>
                    <div className="pt-3">
                      <InviteParentForm studentId={s.id} childName={s.first} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
