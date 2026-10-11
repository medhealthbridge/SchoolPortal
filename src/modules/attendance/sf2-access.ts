import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { sections } from "@/db/schema";
import { permissionsFor, type Role } from "@/lib/roles";
import { currentYear, sectionsOfTeacher } from "@/lib/schedule";

/** Sections whose SF2 this person may open: every one for the office, their own for a teacher. */
export async function sf2Sections(tx: Tx, schoolId: string, session: { userId: string; roles: Role[] }) {
  const perms = permissionsFor(session.roles);
  if (perms.has("attendance.view_all")) {
    const year = await currentYear(tx, schoolId);
    if (!year) return [];
    const all = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, schoolId), eq(sections.schoolYearId, year.id)))
      .orderBy(asc(sections.level), asc(sections.name));
    return all.map((s) => ({ id: s.id, label: `${s.level} ${s.name}` }));
  }
  if (!perms.has("attendance.take")) return [];
  return (await sectionsOfTeacher(tx, schoolId, session.userId)).map((s) => ({ id: s.id, label: s.label }));
}
