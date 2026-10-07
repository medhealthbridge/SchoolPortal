import { and, asc, avg, count, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  attendanceRecords,
  enrollments,
  gradingPeriods,
  scores,
  sections,
  serviceHours,
  students,
  subjects,
  timetableSlots,
} from "@/db/schema";

/** A Philippine school reports 0–100 and passes at 75. */
export const PASSING_SCORE = 75;

export type PeriodRow = typeof gradingPeriods.$inferSelect;

export async function periodsFor(tx: Tx, schoolId: string, schoolYearId: string) {
  return tx
    .select()
    .from(gradingPeriods)
    .where(
      and(
        eq(gradingPeriods.schoolId, schoolId),
        eq(gradingPeriods.schoolYearId, schoolYearId),
      ),
    )
    .orderBy(asc(gradingPeriods.sequence));
}

/** The period today falls in, else the last one that started. */
export function currentPeriod(periods: PeriodRow[], today: string) {
  return (
    periods.find((p) => p.startsOn <= today && today <= p.endsOn) ??
    [...periods].reverse().find((p) => p.startsOn <= today) ??
    periods[0] ??
    null
  );
}

export type ScoreRow = {
  studentId: string;
  studentNumber: string;
  name: string;
  score: number | null;
  remarks: string | null;
};

/** The class list for one subject in one period, with whatever is entered. */
export async function classScores(
  tx: Tx,
  schoolId: string,
  sectionId: string,
  subjectId: string,
  gradingPeriodId: string,
): Promise<ScoreRow[]> {
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
      and(
        eq(enrollments.schoolId, schoolId),
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.status, "active"),
      ),
    )
    .orderBy(asc(students.lastName), asc(students.firstName));

  const entered = await tx
    .select()
    .from(scores)
    .where(
      and(
        eq(scores.schoolId, schoolId),
        eq(scores.subjectId, subjectId),
        eq(scores.gradingPeriodId, gradingPeriodId),
      ),
    );
  const byStudent = new Map(entered.map((s) => [s.studentId, s]));

  return roster.map((r) => ({
    studentId: r.studentId,
    studentNumber: r.studentNumber,
    name: `${r.lastName}, ${r.firstName}`,
    score: byStudent.get(r.studentId)?.score ?? null,
    remarks: byStudent.get(r.studentId)?.remarks ?? null,
  }));
}

export type CardLine = { subject: string; code: string; byPeriod: (number | null)[]; average: number | null };

export type ReportCard = {
  student: typeof students.$inferSelect;
  periods: PeriodRow[];
  lines: CardLine[];
  general: number | null;
  /** Printed on the card when Attendance is on. */
  attendance: { present: number; absent: number; late: number; excused: number } | null;
  /** Printed when SAO or Chaplain is on. */
  serviceHours: number | null;
};

/**
 * The report card. Attendance totals and service hours are printed on it only
 * when those modules are on — the links the plan promised, and the only place
 * Grades reads anything outside itself.
 */
export async function reportCard(
  tx: Tx,
  schoolId: string,
  studentId: string,
  schoolYearId: string,
  opts: { attendance: boolean; serviceHours: boolean },
): Promise<ReportCard | null> {
  const [student] = await tx
    .select()
    .from(students)
    .where(and(eq(students.schoolId, schoolId), eq(students.id, studentId)))
    .limit(1);
  if (!student) return null;

  const periods = await periodsFor(tx, schoolId, schoolYearId);
  const periodIds = periods.map((p) => p.id);

  const rows = periodIds.length
    ? await tx
        .select({
          subjectId: scores.subjectId,
          code: subjects.code,
          name: subjects.name,
          gradingPeriodId: scores.gradingPeriodId,
          score: scores.score,
        })
        .from(scores)
        .innerJoin(subjects, eq(subjects.id, scores.subjectId))
        .where(
          and(
            eq(scores.schoolId, schoolId),
            eq(scores.studentId, studentId),
            inArray(scores.gradingPeriodId, periodIds),
          ),
        )
        .orderBy(asc(subjects.code))
    : [];

  const bySubject = new Map<string, CardLine>();
  for (const r of rows) {
    const line =
      bySubject.get(r.subjectId) ??
      ({
        subject: r.name,
        code: r.code,
        byPeriod: periods.map(() => null),
        average: null,
      } satisfies CardLine);
    const idx = periods.findIndex((p) => p.id === r.gradingPeriodId);
    if (idx >= 0) line.byPeriod[idx] = r.score;
    bySubject.set(r.subjectId, line);
  }

  const lines = [...bySubject.values()];
  for (const line of lines) {
    const got = line.byPeriod.filter((v): v is number => v !== null);
    line.average = got.length ? Math.round(got.reduce((a, b) => a + b, 0) / got.length) : null;
  }
  const averages = lines.map((l) => l.average).filter((v): v is number => v !== null);
  const general = averages.length
    ? Math.round(averages.reduce((a, b) => a + b, 0) / averages.length)
    : null;

  let attendance: ReportCard["attendance"] = null;
  if (opts.attendance) {
    const marks = await tx
      .select({ status: attendanceRecords.status, n: count() })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.schoolId, schoolId),
          eq(attendanceRecords.studentId, studentId),
        ),
      )
      .groupBy(attendanceRecords.status);
    attendance = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const m of marks) attendance[m.status] = Number(m.n);
  }

  let hours: number | null = null;
  if (opts.serviceHours) {
    const [row] = await tx
      .select({ total: sql<number>`coalesce(sum(${serviceHours.hours}), 0)` })
      .from(serviceHours)
      .where(
        and(eq(serviceHours.schoolId, schoolId), eq(serviceHours.studentId, studentId)),
      );
    hours = Number(row?.total ?? 0);
  }

  return { student, periods, lines, general, attendance, serviceHours: hours };
}

/** Classes a teacher enters grades for, in the current year. */
export async function teachingLoad(tx: Tx, schoolId: string, teacherUserId: string) {
  const rows = await tx
    .selectDistinct({
      sectionId: timetableSlots.sectionId,
      subjectId: timetableSlots.subjectId,
      level: sections.level,
      sectionName: sections.name,
      subjectCode: subjects.code,
      subjectName: subjects.name,
    })
    .from(timetableSlots)
    .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.teacherUserId, teacherUserId),
        isNull(timetableSlots.retiredAt),
      ),
    )
    .orderBy(asc(subjects.code));
  return rows;
}

/** How much of a period is entered, for the admin's overview. */
export async function periodProgress(tx: Tx, schoolId: string, gradingPeriodId: string) {
  const [entered] = await tx
    .select({ n: count(), mean: avg(scores.score) })
    .from(scores)
    .where(
      and(eq(scores.schoolId, schoolId), eq(scores.gradingPeriodId, gradingPeriodId)),
    );
  const [failing] = await tx
    .select({ n: count() })
    .from(scores)
    .where(
      and(
        eq(scores.schoolId, schoolId),
        eq(scores.gradingPeriodId, gradingPeriodId),
        lte(scores.score, PASSING_SCORE - 1),
      ),
    );
  return {
    entered: Number(entered?.n ?? 0),
    mean: entered?.mean ? Math.round(Number(entered.mean)) : null,
    failing: Number(failing?.n ?? 0),
  };
}
