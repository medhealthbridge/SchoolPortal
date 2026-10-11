import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  attendanceRecords,
  enrollments,
  rooms,
  schoolYears,
  seatPlans,
  sections,
  students,
  subjects,
  timetableSlots,
  users,
} from "@/db/schema";

export type Slot = {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  subjectName: string;
  sectionLabel: string;
  sectionId: string;
  roomName: string | null;
  roomId: string | null;
};

export async function currentSchoolYear(tx: Tx, schoolId: string) {
  const [row] = await tx
    .select()
    .from(schoolYears)
    .where(and(eq(schoolYears.schoolId, schoolId), eq(schoolYears.isCurrent, true)))
    .limit(1);
  return row ?? null;
}

/** The timetable is what lets the app open the right class by itself. */
export async function slotsForTeacher(
  tx: Tx,
  schoolId: string,
  teacherUserId: string,
  weekday: number,
): Promise<Slot[]> {
  const rows = await tx
    .select({
      id: timetableSlots.id,
      weekday: timetableSlots.weekday,
      startsAt: timetableSlots.startsAt,
      endsAt: timetableSlots.endsAt,
      subjectName: subjects.name,
      sectionLevel: sections.level,
      sectionName: sections.name,
      sectionId: sections.id,
      roomName: rooms.name,
      roomId: rooms.id,
    })
    .from(timetableSlots)
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
    .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.teacherUserId, teacherUserId),
        eq(timetableSlots.weekday, weekday),
        isNull(timetableSlots.retiredAt),
      ),
    )
    .orderBy(asc(timetableSlots.startsAt));

  return rows.map((r) => ({
    id: r.id,
    weekday: r.weekday,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    subjectName: r.subjectName,
    sectionId: r.sectionId,
    sectionLabel: `${r.sectionLevel} ${r.sectionName}`,
    roomName: r.roomName,
    roomId: r.roomId,
  }));
}

export async function slotDetail(tx: Tx, schoolId: string, slotId: string) {
  const [row] = await tx
    .select({
      slot: timetableSlots,
      subjectName: subjects.name,
      sectionLevel: sections.level,
      sectionName: sections.name,
      roomName: rooms.name,
      teacherName: users.name,
    })
    .from(timetableSlots)
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
    .innerJoin(users, eq(users.id, timetableSlots.teacherUserId))
    .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
    .where(and(eq(timetableSlots.schoolId, schoolId), eq(timetableSlots.id, slotId)))
    .limit(1);
  return row ?? null;
}

export type RosterEntry = {
  studentId: string;
  studentNumber: string;
  name: string;
  row: number | null;
  col: number | null;
};

/** Class list plus the saved seat plan for the room this class sits in. */
export async function roster(
  tx: Tx,
  schoolId: string,
  sectionId: string,
  roomId: string | null,
): Promise<RosterEntry[]> {
  const rows = await tx
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

  let layout: { studentId: string; row: number; col: number }[] = [];
  if (roomId) {
    const [plan] = await tx
      .select()
      .from(seatPlans)
      .where(and(eq(seatPlans.sectionId, sectionId), eq(seatPlans.roomId, roomId)))
      .limit(1);
    if (plan) layout = plan.layout as typeof layout;
  }
  const seat = new Map(layout.map((l) => [l.studentId, l]));

  return rows.map((r) => ({
    studentId: r.studentId,
    studentNumber: r.studentNumber,
    name: `${r.lastName}, ${r.firstName}`,
    row: seat.get(r.studentId)?.row ?? null,
    col: seat.get(r.studentId)?.col ?? null,
  }));
}

export async function recordsForSlot(
  tx: Tx,
  schoolId: string,
  slotId: string,
  onDate: string,
) {
  return tx
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.schoolId, schoolId),
        eq(attendanceRecords.slotId, slotId),
        eq(attendanceRecords.onDate, onDate),
      ),
    );
}

export type DailySummary = {
  present: number;
  absent: number;
  late: number;
  excused: number;
  slotsExpected: number;
  slotsSubmitted: number;
};

export async function dailySummary(
  tx: Tx,
  schoolId: string,
  onDate: string,
  weekday: number,
): Promise<DailySummary> {
  const byStatus = await tx
    .select({ status: attendanceRecords.status, n: count() })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.schoolId, schoolId), eq(attendanceRecords.onDate, onDate)))
    .groupBy(attendanceRecords.status);

  const [expected] = await tx
    .select({ n: count() })
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.weekday, weekday),
        isNull(timetableSlots.retiredAt),
      ),
    );

  const submitted = await tx
    .selectDistinct({ slotId: attendanceRecords.slotId })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.schoolId, schoolId), eq(attendanceRecords.onDate, onDate)));

  const out: DailySummary = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    slotsExpected: Number(expected?.n ?? 0),
    slotsSubmitted: submitted.length,
  };
  for (const r of byStatus) out[r.status] = Number(r.n);
  return out;
}

/** Which classes have not submitted today — the principal's first question. */
export async function unsubmittedSlots(
  tx: Tx,
  schoolId: string,
  onDate: string,
  weekday: number,
) {
  const submitted = await tx
    .selectDistinct({ slotId: attendanceRecords.slotId })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.schoolId, schoolId), eq(attendanceRecords.onDate, onDate)));
  const done = new Set(submitted.map((s) => s.slotId));

  const all = await tx
    .select({
      id: timetableSlots.id,
      startsAt: timetableSlots.startsAt,
      subjectName: subjects.name,
      sectionLevel: sections.level,
      sectionName: sections.name,
      teacherName: users.name,
    })
    .from(timetableSlots)
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
    .innerJoin(users, eq(users.id, timetableSlots.teacherUserId))
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.weekday, weekday),
        isNull(timetableSlots.retiredAt),
      ),
    )
    .orderBy(asc(timetableSlots.startsAt));

  return all.filter((s) => !done.has(s.id));
}

export type MonthlyRow = {
  studentId: string;
  studentNumber: string;
  name: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

function monthBounds(month: string) {
  const from = `${month}-01`;
  const to = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

/** The monthly report, in the shape a school exports. */
export async function monthlyReport(
  tx: Tx,
  schoolId: string,
  month: string,
  sectionId?: string,
): Promise<MonthlyRow[]> {
  const { from, to } = monthBounds(month);

  const where = [
    eq(attendanceRecords.schoolId, schoolId),
    gte(attendanceRecords.onDate, from),
    lte(attendanceRecords.onDate, to),
  ];
  if (sectionId) where.push(eq(timetableSlots.sectionId, sectionId));

  const rows = await tx
    .select({
      studentId: students.id,
      studentNumber: students.studentNumber,
      firstName: students.firstName,
      lastName: students.lastName,
      status: attendanceRecords.status,
      n: count(),
    })
    .from(attendanceRecords)
    .innerJoin(students, eq(students.id, attendanceRecords.studentId))
    .innerJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.slotId))
    .where(and(...where))
    .groupBy(
      students.id,
      students.studentNumber,
      students.firstName,
      students.lastName,
      attendanceRecords.status,
    )
    .orderBy(asc(students.lastName));

  const map = new Map<string, MonthlyRow>();
  for (const r of rows) {
    const existing =
      map.get(r.studentId) ??
      ({
        studentId: r.studentId,
        studentNumber: r.studentNumber,
        name: `${r.lastName}, ${r.firstName}`,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      } satisfies MonthlyRow);
    existing[r.status] = Number(r.n);
    map.set(r.studentId, existing);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Consecutive school days a student has been absent, counting back from
 * `onDate`. Three in a row flags the adviser and guidance.
 */
export async function absenceStreak(
  tx: Tx,
  schoolId: string,
  studentId: string,
  onDate: string,
) {
  const rows = await tx
    .select({
      onDate: attendanceRecords.onDate,
      absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')`,
      total: count(),
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.schoolId, schoolId),
        eq(attendanceRecords.studentId, studentId),
        lte(attendanceRecords.onDate, onDate),
      ),
    )
    .groupBy(attendanceRecords.onDate)
    .orderBy(desc(attendanceRecords.onDate))
    .limit(10);

  let streak = 0;
  for (const day of rows) {
    // A day counts as an absence when the student missed every class on it.
    if (Number(day.absent) > 0 && Number(day.absent) === Number(day.total)) streak += 1;
    else break;
  }
  return streak;
}

export async function tardyCount(tx: Tx, schoolId: string, studentId: string, month: string) {
  const { from, to } = monthBounds(month);
  const [row] = await tx
    .select({ n: count() })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.schoolId, schoolId),
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceRecords.status, "late"),
        gte(attendanceRecords.onDate, from),
        lte(attendanceRecords.onDate, to),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function studentsByIds(tx: Tx, schoolId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return tx
    .select()
    .from(students)
    .where(and(eq(students.schoolId, schoolId), inArray(students.id, ids)));
}
