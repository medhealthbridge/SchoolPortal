import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { assessmentScores, assessments, enrollments, students, subjects, timetableSlots } from "@/db/schema";
import { permissionsFor, type Role } from "@/lib/roles";
import { computeLine, groupOf, GROUPS, type ClassRecordLine, type Component } from "./deped";

export type Assessment = typeof assessments.$inferSelect;

/**
 * Whether this person keeps the class record for a section's subject: the
 * teacher on the timetable for it, or anyone who manages grades school-wide.
 */
export async function mayKeepRecord(
  tx: Tx,
  schoolId: string,
  session: { userId: string; roles: Role[] },
  sectionId: string,
  subjectId: string,
) {
  const perms = permissionsFor(session.roles);
  if (perms.has("grades.manage_periods")) return true;
  if (!perms.has("grades.enter")) return false;
  const [slot] = await tx
    .select({ id: timetableSlots.id })
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.sectionId, sectionId),
        eq(timetableSlots.subjectId, subjectId),
        eq(timetableSlots.teacherUserId, session.userId),
        isNull(timetableSlots.retiredAt),
      ),
    )
    .limit(1);
  return Boolean(slot);
}

export type RecordRow = {
  studentId: string;
  studentNumber: string;
  name: string;
  raw: Map<string, number>;
  line: ClassRecordLine;
};

/** The whole class record for one subject, section and quarter. */
export async function classRecord(
  tx: Tx,
  schoolId: string,
  sectionId: string,
  subjectId: string,
  gradingPeriodId: string,
) {
  const [subject] = await tx
    .select()
    .from(subjects)
    .where(and(eq(subjects.schoolId, schoolId), eq(subjects.id, subjectId)))
    .limit(1);
  const group = groupOf(subject?.gradingGroup);
  const weights = GROUPS[group].weights;

  const items = await tx
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.schoolId, schoolId),
        eq(assessments.sectionId, sectionId),
        eq(assessments.subjectId, subjectId),
        eq(assessments.gradingPeriodId, gradingPeriodId),
      ),
    )
    .orderBy(asc(assessments.component), asc(assessments.createdAt));

  const roster = await tx
    .select({
      studentId: students.id,
      studentNumber: students.studentNumber,
      firstName: students.firstName,
      lastName: students.lastName,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(
      and(eq(enrollments.schoolId, schoolId), eq(enrollments.sectionId, sectionId), eq(enrollments.status, "active")),
    )
    .orderBy(asc(students.lastName), asc(students.firstName));

  const raws = items.length
    ? await tx
        .select()
        .from(assessmentScores)
        .where(
          and(
            eq(assessmentScores.schoolId, schoolId),
            inArray(
              assessmentScores.assessmentId,
              items.map((i) => i.id),
            ),
          ),
        )
    : [];

  const rows: RecordRow[] = roster.map((r) => {
    const raw = new Map(raws.filter((x) => x.studentId === r.studentId).map((x) => [x.assessmentId, x.raw]));
    return {
      studentId: r.studentId,
      studentNumber: r.studentNumber,
      name: `${r.lastName}, ${r.firstName}`,
      raw,
      line: computeLine(
        weights,
        items.map((i) => ({ id: i.id, component: i.component as Component, highestScore: i.highestScore })),
        raw,
      ),
    };
  });

  return { subject, group, weights, items, rows };
}
