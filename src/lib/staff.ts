/**
 * Teachers as the office sees them: who they are, whether they can sign in,
 * which section they advise and how much of the week they teach.
 */
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { invites, sections, subjects, timetableSlots, userRoles, users } from "@/db/schema";
import { currentYear } from "./schedule";

export const TEACHING_ROLES = ["teacher", "adviser"] as const;

export type TeacherRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: "invited" | "active" | "disabled";
  lastLoginAt: Date | null;
  roles: string[];
  advises: string[];
  classesPerWeek: number;
  subjects: string[];
};

export async function teacherRoster(tx: Tx, schoolId: string): Promise<TeacherRow[]> {
  const held = await tx
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.schoolId, schoolId));
  const rolesOf = new Map<string, string[]>();
  for (const h of held) rolesOf.set(h.userId, [...(rolesOf.get(h.userId) ?? []), h.role]);
  const ids = [...rolesOf.entries()]
    .filter(([, r]) => r.some((x) => (TEACHING_ROLES as readonly string[]).includes(x)))
    .map(([id]) => id);
  if (ids.length === 0) return [];

  const people = await tx
    .select()
    .from(users)
    .where(and(eq(users.schoolId, schoolId), inArray(users.id, ids)))
    .orderBy(asc(users.name));

  const year = await currentYear(tx, schoolId);
  const advised = year
    ? await tx
        .select({ adviser: sections.adviserUserId, level: sections.level, name: sections.name })
        .from(sections)
        .where(and(eq(sections.schoolId, schoolId), eq(sections.schoolYearId, year.id)))
    : [];
  const load = year
    ? await tx
        .select({ teacher: timetableSlots.teacherUserId, n: count() })
        .from(timetableSlots)
        .where(
          and(
            eq(timetableSlots.schoolId, schoolId),
            eq(timetableSlots.schoolYearId, year.id),
            isNull(timetableSlots.retiredAt),
          ),
        )
        .groupBy(timetableSlots.teacherUserId)
    : [];
  const taught = year
    ? await tx
        .selectDistinct({ teacher: timetableSlots.teacherUserId, subject: subjects.name })
        .from(timetableSlots)
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(
          and(
            eq(timetableSlots.schoolId, schoolId),
            eq(timetableSlots.schoolYearId, year.id),
            isNull(timetableSlots.retiredAt),
          ),
        )
    : [];

  return people.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    roles: rolesOf.get(u.id) ?? [],
    advises: advised.filter((a) => a.adviser === u.id).map((a) => `${a.level} ${a.name}`),
    classesPerWeek: Number(load.find((l) => l.teacher === u.id)?.n ?? 0),
    subjects: [...new Set(taught.filter((t) => t.teacher === u.id).map((t) => t.subject))].sort(),
  }));
}

/** Teacher invites nobody has accepted yet. */
export async function openTeacherInvites(tx: Tx, schoolId: string) {
  return tx
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.schoolId, schoolId),
        isNull(invites.acceptedAt),
        inArray(invites.role, [...TEACHING_ROLES]),
      ),
    )
    .orderBy(asc(invites.createdAt));
}
