/**
 * The class schedule: who teaches what, to which section, in which room, when.
 *
 * One row of `timetable_slots` is one class meeting on one weekday. Everything
 * a person sees about their week (a teacher's classes, a section's day, a
 * child's timetable) is read from here, and attendance opens the right class
 * because of it. Only live rows count; a retired class keeps its old marks and
 * is otherwise gone.
 */
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  enrollments,
  rooms,
  schoolYears,
  sections,
  subjects,
  timetableSlots,
  users,
} from "@/db/schema";
import { WEEKDAYS, prettyTime } from "./format";

/** Monday to Saturday. A Sunday class is allowed but not offered. */
export const SCHOOL_DAYS = [1, 2, 3, 4, 5, 6] as const;

export const dayName = (n: number) => WEEKDAYS[n] ?? "";

/** "7:30", "07:30" and "07:30:00" are the same time; anything else is not a time. */
export function normaliseTime(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const [h, min, sec] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || min > 59 || sec > 59) return null;
  return [h, min, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Half-open: a class ending at 9:00 does not clash with one starting at 9:00. */
export function overlaps(
  a: { startsAt: string; endsAt: string },
  b: { startsAt: string; endsAt: string },
) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export type ScheduleEntry = {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  sectionId: string;
  sectionLabel: string;
  teacherUserId: string;
  teacherName: string;
  roomId: string | null;
  roomName: string | null;
};

export async function currentYear(tx: Tx, schoolId: string) {
  const [year] = await tx
    .select()
    .from(schoolYears)
    .where(and(eq(schoolYears.schoolId, schoolId), eq(schoolYears.isCurrent, true)))
    .limit(1);
  return year ?? null;
}

/** Live classes for some sections, or for one teacher, in the current year. */
export async function scheduleFor(
  tx: Tx,
  schoolId: string,
  by: { sectionIds?: string[]; teacherUserId?: string },
): Promise<ScheduleEntry[]> {
  if (by.sectionIds && by.sectionIds.length === 0) return [];
  const year = await currentYear(tx, schoolId);
  if (!year) return [];

  const rows = await tx
    .select({
      id: timetableSlots.id,
      weekday: timetableSlots.weekday,
      startsAt: timetableSlots.startsAt,
      endsAt: timetableSlots.endsAt,
      subjectId: subjects.id,
      subjectName: subjects.name,
      subjectCode: subjects.code,
      sectionId: sections.id,
      level: sections.level,
      section: sections.name,
      teacherUserId: users.id,
      teacherName: users.name,
      roomId: rooms.id,
      roomName: rooms.name,
    })
    .from(timetableSlots)
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
    .innerJoin(users, eq(users.id, timetableSlots.teacherUserId))
    .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.schoolYearId, year.id),
        isNull(timetableSlots.retiredAt),
        by.sectionIds ? inArray(timetableSlots.sectionId, by.sectionIds) : undefined,
        by.teacherUserId ? eq(timetableSlots.teacherUserId, by.teacherUserId) : undefined,
      ),
    )
    .orderBy(asc(timetableSlots.weekday), asc(timetableSlots.startsAt));

  return rows.map(({ level, section, ...r }) => ({ ...r, sectionLabel: `${level} ${section}` }));
}

/** Entries grouped by weekday, in day order, with empty days left out. */
export function byDay(entries: ScheduleEntry[]) {
  const days = new Map<number, ScheduleEntry[]>();
  for (const e of entries) days.set(e.weekday, [...(days.get(e.weekday) ?? []), e]);
  return [...days.entries()].sort(([a], [b]) => a - b);
}

/** "Monday: Ms Cruz already teaches …" */
export const prettyClash = (weekday: number, message: string) => `${dayName(weekday)}: ${message}`;

export type Candidate = {
  schoolYearId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  teacherUserId: string;
  sectionId: string;
  roomId: string | null;
};

/**
 * Everything a new or moved class would collide with, as sentences: the
 * teacher in two places, the section in two classes, or the room booked twice.
 * Empty means it fits.
 */
export async function clashesFor(
  tx: Tx,
  schoolId: string,
  c: Candidate,
  exceptId?: string,
): Promise<string[]> {
  const same = [
    eq(timetableSlots.teacherUserId, c.teacherUserId),
    eq(timetableSlots.sectionId, c.sectionId),
  ];
  if (c.roomId) same.push(eq(timetableSlots.roomId, c.roomId));

  const rows = await tx
    .select({
      teacherUserId: timetableSlots.teacherUserId,
      sectionId: timetableSlots.sectionId,
      roomId: timetableSlots.roomId,
      startsAt: timetableSlots.startsAt,
      endsAt: timetableSlots.endsAt,
      subject: subjects.name,
      level: sections.level,
      section: sections.name,
      teacher: users.name,
      room: rooms.name,
    })
    .from(timetableSlots)
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
    .innerJoin(users, eq(users.id, timetableSlots.teacherUserId))
    .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.schoolYearId, c.schoolYearId),
        eq(timetableSlots.weekday, c.weekday),
        isNull(timetableSlots.retiredAt),
        exceptId ? ne(timetableSlots.id, exceptId) : undefined,
        or(...same),
      ),
    );

  const out: string[] = [];
  for (const r of rows.filter((r) => overlaps(r, c))) {
    const when = `${prettyTime(r.startsAt)} to ${prettyTime(r.endsAt)}`;
    const label = `${r.level} ${r.section}`;
    if (r.teacherUserId === c.teacherUserId)
      out.push(`${r.teacher} already teaches ${r.subject} to ${label} from ${when}.`);
    if (r.sectionId === c.sectionId && r.teacherUserId !== c.teacherUserId)
      out.push(`${label} already has ${r.subject} with ${r.teacher} from ${when}.`);
    if (c.roomId && r.roomId === c.roomId && r.sectionId !== c.sectionId && r.teacherUserId !== c.teacherUserId)
      out.push(`${r.room} is taken by ${label} for ${r.subject} from ${when}.`);
  }
  return [...new Set(out)];
}

/** The section a student is in this year, with its adviser. */
export async function sectionOfStudent(tx: Tx, schoolId: string, studentId: string) {
  const year = await currentYear(tx, schoolId);
  if (!year) return null;
  const [row] = await tx
    .select({
      id: sections.id,
      level: sections.level,
      name: sections.name,
      adviserUserId: sections.adviserUserId,
      adviserName: users.name,
      adviserEmail: users.email,
    })
    .from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .leftJoin(users, eq(users.id, sections.adviserUserId))
    .where(
      and(
        eq(enrollments.schoolId, schoolId),
        eq(enrollments.studentId, studentId),
        eq(enrollments.schoolYearId, year.id),
        eq(enrollments.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Sections a teacher meets this year: the ones they teach and the one they advise. */
export async function sectionsOfTeacher(tx: Tx, schoolId: string, userId: string) {
  const year = await currentYear(tx, schoolId);
  if (!year) return [];
  const taught = await tx
    .selectDistinct({ id: timetableSlots.sectionId })
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.schoolYearId, year.id),
        eq(timetableSlots.teacherUserId, userId),
        isNull(timetableSlots.retiredAt),
      ),
    );
  const advised = await tx
    .select({ id: sections.id })
    .from(sections)
    .where(
      and(
        eq(sections.schoolId, schoolId),
        eq(sections.schoolYearId, year.id),
        eq(sections.adviserUserId, userId),
      ),
    );
  const ids = [...new Set([...taught, ...advised].map((r) => r.id))];
  if (ids.length === 0) return [];
  const rows = await tx
    .select()
    .from(sections)
    .where(and(eq(sections.schoolId, schoolId), inArray(sections.id, ids)))
    .orderBy(asc(sections.level), asc(sections.name));
  const advisedIds = new Set(advised.map((a) => a.id));
  return rows.map((s) => ({ ...s, label: `${s.level} ${s.name}`, advises: advisedIds.has(s.id) }));
}
