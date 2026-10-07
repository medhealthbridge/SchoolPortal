/**
 * Learning materials: the slides, handouts and worksheets a teacher shares
 * with a section, kept so students can go over them again.
 *
 * Files go straight from the teacher's browser to storage (Vercel Blob in
 * production), never through the app, because a serverless function takes at
 * most 4.5 MB per request and a slide deck is often more. Locally they go to
 * disk. Every link to a file goes through /materials/open/<id>, which checks
 * who is asking first.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { learningMaterials, sections, subjects, timetableSlots, users } from "@/db/schema";
import { permissionsFor } from "./roles";
import { currentYear, sectionOfStudent, sectionsOfTeacher } from "./schedule";
import { watchedStudents } from "./student-access";
import type { SchoolSession } from "./session";

export * from "./material-files";

export function materialsMode(): "blob" | "local" | "none" {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.VERCEL) return "none"; // a serverless host has no disk to keep files on
  return "local";
}

const isOffice = (perms: Set<string>) => perms.has("timetable.manage") || perms.has("staff.manage");

/** Sections and subjects this person may share materials with. */
export async function uploadTargets(tx: Tx, schoolId: string, session: Pick<SchoolSession, "userId" | "roles">) {
  const perms = permissionsFor(session.roles);
  const year = await currentYear(tx, schoolId);
  if (!year) return [];
  const allSubjects = await tx.select().from(subjects).where(eq(subjects.schoolId, schoolId)).orderBy(asc(subjects.name));

  if (isOffice(perms)) {
    const all = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, schoolId), eq(sections.schoolYearId, year.id)))
      .orderBy(asc(sections.level), asc(sections.name));
    return all.map((s) => ({ id: s.id, label: `${s.level} ${s.name}`, subjects: allSubjects }));
  }
  if (!perms.has("attendance.take")) return [];

  const mine = await sectionsOfTeacher(tx, schoolId, session.userId);
  const taught = await tx
    .selectDistinct({ sectionId: timetableSlots.sectionId, subjectId: timetableSlots.subjectId })
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.schoolYearId, year.id),
        eq(timetableSlots.teacherUserId, session.userId),
        isNull(timetableSlots.retiredAt),
      ),
    );
  // A teacher shares for the subjects they teach in a section; the adviser
  // may share for any subject in their own section.
  return mine.map((s) => ({
    id: s.id,
    label: s.label,
    subjects: s.advises
      ? allSubjects
      : allSubjects.filter((sub) => taught.some((t) => t.sectionId === s.id && t.subjectId === sub.id)),
  }));
}

export async function mayUpload(
  tx: Tx,
  schoolId: string,
  session: Pick<SchoolSession, "userId" | "roles">,
  sectionId: string,
  subjectId: string,
) {
  const targets = await uploadTargets(tx, schoolId, session);
  return targets.some((t) => t.id === sectionId && t.subjects.some((s) => s.id === subjectId));
}

/**
 * Sections whose materials this person may open. `null` means every section
 * (the office, and any staff who can see all students).
 */
export async function readableSections(
  tx: Tx,
  schoolId: string,
  session: SchoolSession,
): Promise<string[] | null> {
  const perms = permissionsFor(session.roles);
  if (isOffice(perms) || perms.has("students.manage") || perms.has("grades.view_all")) return null;
  const ids = new Set<string>();
  if (perms.has("attendance.take"))
    for (const s of await sectionsOfTeacher(tx, schoolId, session.userId)) ids.add(s.id);
  for (const s of await watchedStudents(tx, schoolId, session)) {
    const sec = await sectionOfStudent(tx, schoolId, s.id);
    if (sec) ids.add(sec.id);
  }
  return [...ids];
}

export async function materialsFor(tx: Tx, schoolId: string, sectionIds: string[] | null) {
  if (sectionIds && sectionIds.length === 0) return [];
  return tx
    .select({
      m: learningMaterials,
      subject: subjects.name,
      level: sections.level,
      section: sections.name,
      teacher: users.name,
    })
    .from(learningMaterials)
    .innerJoin(subjects, eq(subjects.id, learningMaterials.subjectId))
    .innerJoin(sections, eq(sections.id, learningMaterials.sectionId))
    .leftJoin(users, eq(users.id, learningMaterials.uploadedByUserId))
    .where(
      and(
        eq(learningMaterials.schoolId, schoolId),
        sectionIds ? inArray(learningMaterials.sectionId, sectionIds) : undefined,
      ),
    )
    .orderBy(asc(subjects.name), desc(learningMaterials.createdAt));
}

/** Whether this person may take a material down: who shared it, or the office. */
export function mayRemove(session: Pick<SchoolSession, "userId" | "roles">, uploadedBy: string | null) {
  return uploadedBy === session.userId || isOffice(permissionsFor(session.roles));
}
