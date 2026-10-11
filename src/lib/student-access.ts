import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { studentGuardians, students } from "@/db/schema";
import type { SchoolSession } from "./session";
import { permissionsFor, type Permission } from "./roles";

/**
 * Whether this person may see one student's record.
 *
 * Staff with the school-wide permission see everyone; a parent sees the
 * children linked to them; a student sees the record they claimed. Checked on
 * the server for every request, because a student id in a URL is a guess
 * anyone can make.
 */
export async function canSeeStudent(
  tx: Tx,
  schoolId: string,
  session: SchoolSession,
  studentId: string,
  wide: Permission,
) {
  const perms = permissionsFor(session.roles);
  if (perms.has(wide)) return true;

  const [own] = await tx
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        eq(students.schoolId, schoolId),
        eq(students.id, studentId),
        eq(students.claimedByUserId, session.userId),
      ),
    )
    .limit(1);
  if (own) return true;

  const [child] = await tx
    .select({ id: studentGuardians.id })
    .from(studentGuardians)
    .where(
      and(
        eq(studentGuardians.schoolId, schoolId),
        eq(studentGuardians.studentId, studentId),
        eq(studentGuardians.guardianUserId, session.userId),
      ),
    )
    .limit(1);
  return Boolean(child);
}

/** Every student this person may look at: their own, or their children's. */
export async function watchedStudents(tx: Tx, schoolId: string, session: SchoolSession) {
  const mine = await tx
    .select()
    .from(students)
    .where(
      and(eq(students.schoolId, schoolId), eq(students.claimedByUserId, session.userId)),
    );
  const children = await tx
    .select({ student: students })
    .from(studentGuardians)
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .where(
      and(
        eq(studentGuardians.schoolId, schoolId),
        eq(studentGuardians.guardianUserId, session.userId),
      ),
    );
  const seen = new Set<string>();
  return [...mine, ...children.map((c) => c.student)].filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}
