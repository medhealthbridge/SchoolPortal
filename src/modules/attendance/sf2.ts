/**
 * The School Form 2 (SF2): a section's daily attendance for one month, one
 * row per learner and one column per school day, with the month's totals.
 *
 * Marks are taken per class, so a day is read from all of a learner's marks
 * that day: absent only if every mark was absent, tardy if any was late,
 * otherwise present (or excused). A day with no marks is left blank.
 */
import { and, asc, between, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db";
import { attendanceRecords, enrollments, sections, students } from "@/db/schema";

export type DayMark = "P" | "A" | "L" | "E" | "";

export function dayMark(statuses: string[]): DayMark {
  if (statuses.length === 0) return "";
  if (statuses.every((s) => s === "absent")) return "A";
  if (statuses.includes("late")) return "L";
  if (statuses.includes("present")) return "P";
  if (statuses.every((s) => s === "excused" || s === "absent")) return "E";
  return "P";
}

/** Monday to Friday of a YYYY-MM month. */
export function schoolDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export type Sf2Row = {
  studentId: string;
  name: string;
  lrn: string | null;
  sex: string | null;
  days: DayMark[];
  absent: number;
  tardy: number;
  present: number;
};

export async function sf2(tx: Tx, schoolId: string, sectionId: string, month: string) {
  const [section] = await tx
    .select()
    .from(sections)
    .where(and(eq(sections.schoolId, schoolId), eq(sections.id, sectionId)))
    .limit(1);
  if (!section) return null;
  const days = schoolDays(month);

  const roster = await tx
    .select({ s: students })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.schoolId, schoolId), eq(enrollments.sectionId, sectionId), eq(enrollments.status, "active")))
    .orderBy(asc(students.sex), asc(students.lastName), asc(students.firstName));

  const marks =
    roster.length && days.length
      ? await tx
          .select({ studentId: attendanceRecords.studentId, onDate: attendanceRecords.onDate, status: attendanceRecords.status })
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.schoolId, schoolId),
              inArray(
                attendanceRecords.studentId,
                roster.map((r) => r.s.id),
              ),
              between(attendanceRecords.onDate, days[0], days[days.length - 1]),
            ),
          )
      : [];
  const byKey = new Map<string, string[]>();
  for (const m of marks) {
    const k = `${m.studentId}|${m.onDate}`;
    byKey.set(k, [...(byKey.get(k) ?? []), m.status]);
  }

  const rows: Sf2Row[] = roster.map(({ s }) => {
    const dayMarks = days.map((d) => dayMark(byKey.get(`${s.id}|${d}`) ?? []));
    return {
      studentId: s.id,
      name: [`${s.lastName},`, s.firstName, s.middleName].filter(Boolean).join(" "),
      lrn: s.lrn,
      sex: s.sex,
      days: dayMarks,
      absent: dayMarks.filter((x) => x === "A").length,
      tardy: dayMarks.filter((x) => x === "L").length,
      present: dayMarks.filter((x) => x === "P" || x === "L").length,
    };
  });

  // Daily totals of learners present (tardy counts as present), as SF2 prints them.
  const dailyPresent = days.map((_, i) => rows.filter((r) => r.days[i] === "P" || r.days[i] === "L").length);
  return { section, days, rows, dailyPresent };
}
