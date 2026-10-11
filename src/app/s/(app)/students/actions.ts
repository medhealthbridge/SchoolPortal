"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { withTenant, type Tx } from "@/db";
import {
  attendanceRecords,
  enrollments,
  incidents,
  schoolYears,
  scores,
  sections,
  studentCharges,
  students,
} from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { activationCode } from "@/lib/password";
import { audit, emit } from "@/lib/audit";
import { readSheet } from "@/lib/csv";
import { parseStudent, type StudentInput } from "@/lib/student-profile";

type ActionResult = { ok?: string; error?: string; issues?: string[] } | null;

const FIELDS = [
  "student_number",
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "lrn",
  "birth_date",
  "sex",
  "place_of_birth",
  "mother_tongue",
  "religion",
  "ip_group",
  "four_ps",
  "disability",
  "psa_birth_cert_no",
  "address",
  "guardian_name",
  "guardian_phone",
] as const;

function fromForm(form: FormData) {
  const raw: Record<string, string> = {};
  for (const f of FIELDS) raw[f] = String(form.get(f) ?? "");
  // A checkbox is absent when unticked.
  raw.four_ps = form.get("four_ps") ? "yes" : "no";
  return raw;
}

/** The columns of `students` this input sets, without the section. */
function columns(v: StudentInput) {
  const { section: _section, ...rest } = v;
  void _section;
  return rest;
}

/** Another student in this school already holds the number or the LRN. */
async function clash(tx: Tx, schoolId: string, v: StudentInput, exceptId?: string) {
  const others = await tx.select().from(students).where(eq(students.schoolId, schoolId));
  for (const o of others) {
    if (o.id === exceptId) continue;
    if (o.studentNumber === v.studentNumber)
      return `Student number ${v.studentNumber} belongs to ${o.lastName}, ${o.firstName}.`;
    if (v.lrn && o.lrn === v.lrn) return `That LRN belongs to ${o.lastName}, ${o.firstName}.`;
  }
  return null;
}

async function currentYear(tx: Tx, schoolId: string) {
  const [year] = await tx
    .select()
    .from(schoolYears)
    .where(and(eq(schoolYears.schoolId, schoolId), eq(schoolYears.isCurrent, true)))
    .limit(1);
  return year ?? null;
}

async function enroll(tx: Tx, schoolId: string, studentId: string, sectionId: string) {
  const year = await currentYear(tx, schoolId);
  if (!year) return false;
  await tx
    .insert(enrollments)
    .values({ schoolId, studentId, sectionId, schoolYearId: year.id, status: "active" })
    .onConflictDoUpdate({
      target: [enrollments.studentId, enrollments.schoolYearId],
      set: { sectionId, status: "active" },
    });
  await emit(tx, schoolId, "student.enrolled", { studentId, sectionId });
  return true;
}

export async function addStudent(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("students.manage");
  const parsed = parseStudent(fromForm(form));
  if (parsed.errors) return { error: parsed.errors[0], issues: parsed.errors.slice(1) };
  const v = parsed.value;
  const sectionId = String(form.get("sectionId") ?? "");

  const outcome = await withTenant(school.id, async (tx) => {
    const taken = await clash(tx, school.id, v);
    if (taken) return { error: taken };

    const [row] = await tx
      .insert(students)
      .values({
        schoolId: school.id,
        ...columns(v),
        activationCode: activationCode(),
        parentCode: activationCode(),
      })
      .returning();

    let placed = false;
    if (sectionId) {
      const [section] = await tx
        .select()
        .from(sections)
        .where(and(eq(sections.id, sectionId), eq(sections.schoolId, school.id)))
        .limit(1);
      if (section) placed = await enroll(tx, school.id, row.id, section.id);
    }

    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "student.created",
      entity: "students",
      entityId: row.id,
      after: { studentNumber: v.studentNumber, name: `${v.lastName}, ${v.firstName}` },
    });
    return { id: row.id, placed, asked: Boolean(sectionId) };
  });

  if ("error" in outcome) return { error: outcome.error };
  revalidatePath("/students");
  const note =
    outcome.asked && !outcome.placed
      ? " Set a current school year in Setup to place them in a section."
      : "";
  return { ok: `${v.firstName} ${v.lastName} added.${note}` };
}

export async function updateStudent(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("students.manage");
  const id = String(form.get("id") ?? "");
  const parsed = parseStudent(fromForm(form));
  if (parsed.errors) return { error: parsed.errors[0], issues: parsed.errors.slice(1) };
  const v = parsed.value;
  const sectionId = String(form.get("sectionId") ?? "");

  const outcome = await withTenant(school.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.schoolId, school.id)))
      .limit(1);
    if (!before) return { error: "That student is not on file." };

    const taken = await clash(tx, school.id, v, id);
    if (taken) return { error: taken };

    await tx.update(students).set(columns(v)).where(eq(students.id, id));

    if (sectionId) {
      const [section] = await tx
        .select()
        .from(sections)
        .where(and(eq(sections.id, sectionId), eq(sections.schoolId, school.id)))
        .limit(1);
      if (section && !before.archivedAt) await enroll(tx, school.id, id, section.id);
    }

    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "student.updated",
      entity: "students",
      entityId: id,
      before: { studentNumber: before.studentNumber, lrn: before.lrn },
      after: { studentNumber: v.studentNumber, lrn: v.lrn },
    });
    return { ok: true };
  });

  if ("error" in outcome) return { error: outcome.error };
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  return { ok: "Saved." };
}

/**
 * Withdrawing keeps the record, and everything attached to it: marks, grades
 * and fees stay readable. The student drops off rosters, class lists for
 * grading, invoices and announcements, which all read "active" enrolments.
 */
export async function withdrawStudent(form: FormData) {
  const { school, session } = await requirePermission("students.manage");
  const id = String(form.get("id") ?? "");
  await withTenant(school.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.schoolId, school.id)))
      .limit(1);
    if (!row || row.archivedAt) return;
    await tx.update(students).set({ archivedAt: new Date() }).where(eq(students.id, id));
    await tx
      .update(enrollments)
      .set({ status: "withdrawn" })
      .where(and(eq(enrollments.studentId, id), eq(enrollments.status, "active")));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "student.withdrawn",
      entity: "students",
      entityId: id,
    });
  });
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
}

export async function restoreStudent(form: FormData) {
  const { school, session } = await requirePermission("students.manage");
  const id = String(form.get("id") ?? "");
  await withTenant(school.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.schoolId, school.id)))
      .limit(1);
    if (!row || !row.archivedAt) return;
    await tx.update(students).set({ archivedAt: null }).where(eq(students.id, id));
    await tx
      .update(enrollments)
      .set({ status: "active" })
      .where(and(eq(enrollments.studentId, id), eq(enrollments.status, "withdrawn")));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "student.restored",
      entity: "students",
      entityId: id,
    });
  });
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
}

/**
 * Deleting is only for a record entered by mistake. Every table that refers to
 * a student cascades, so a student with marks, grades, fees or incidents is
 * refused rather than taking that history with them. Withdraw them instead.
 */
export async function deleteStudent(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("students.manage");
  const id = String(form.get("id") ?? "");

  const outcome = await withTenant(school.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.schoolId, school.id)))
      .limit(1);
    if (!row) return { error: "That student is not on file." };

    const history = await Promise.all(
      [attendanceRecords, scores, studentCharges, incidents].map(async (t) => {
        const [r] = await tx
          .select({ n: count() })
          .from(t)
          .where(and(eq(t.schoolId, school.id), eq(t.studentId, id)));
        return Number(r?.n ?? 0);
      }),
    );
    if (history.some((n) => n > 0))
      return {
        error:
          "This student has marks, grades, fees or discipline records, so they cannot be deleted. Withdraw them instead and the history stays.",
      };

    await tx.delete(students).where(eq(students.id, id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "student.deleted",
      entity: "students",
      entityId: id,
      before: { studentNumber: row.studentNumber, name: `${row.lastName}, ${row.firstName}` },
    });
    return { ok: true };
  });

  if ("error" in outcome) return { error: outcome.error };
  revalidatePath("/students");
  return { ok: "Deleted." };
}

export async function importStudents(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("students.manage");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };

  const text = await file.text();
  const { records, issues } = readSheet(text, ["student_number", "first_name", "last_name"]);
  const problems = issues.map((i) => `Line ${i.line}: ${i.message}`);

  const rows: StudentInput[] = [];
  const numbers = new Set<string>();
  const lrns = new Set<string>();
  for (const r of records) {
    const parsed = parseStudent(r);
    if (parsed.errors) {
      for (const e of parsed.errors) problems.push(`Line ${r.__line}: ${e}`);
      continue;
    }
    const v = parsed.value;
    if (numbers.has(v.studentNumber))
      problems.push(`Line ${r.__line}: student number ${v.studentNumber} appears twice.`);
    if (v.lrn && lrns.has(v.lrn)) problems.push(`Line ${r.__line}: LRN ${v.lrn} appears twice.`);
    numbers.add(v.studentNumber);
    if (v.lrn) lrns.add(v.lrn);
    rows.push(v);
  }

  // "Errors are shown before anything is saved."
  if (problems.length > 0) return { error: "Nothing was saved.", issues: problems.slice(0, 25) };

  const outcome = await withTenant(school.id, async (tx) => {
    const sectionRows = await tx.select().from(sections).where(eq(sections.schoolId, school.id));
    const sectionByName = new Map(
      sectionRows.map((s) => [`${s.level} ${s.name}`.toLowerCase(), s]),
    );
    const existing = await tx.select().from(students).where(eq(students.schoolId, school.id));
    const heldNumbers = new Set(existing.map((s) => s.studentNumber));
    const heldLrns = new Set(existing.flatMap((s) => (s.lrn ? [s.lrn] : [])));

    let added = 0;
    const skipped: string[] = [];
    const unknownSections = new Set<string>();
    for (const v of rows) {
      if (heldNumbers.has(v.studentNumber) || (v.lrn && heldLrns.has(v.lrn))) {
        skipped.push(v.studentNumber);
        continue;
      }
      const [student] = await tx
        .insert(students)
        .values({
          schoolId: school.id,
          ...columns(v),
          activationCode: activationCode(),
          parentCode: activationCode(),
        })
        .returning();
      added += 1;

      if (v.section) {
        const section = sectionByName.get(v.section.toLowerCase());
        if (section) await enroll(tx, school.id, student.id, section.id);
        else unknownSections.add(v.section);
      }
    }

    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "students.imported",
      after: { count: added, skipped: skipped.length },
    });
    return { added, skipped, unknownSections: [...unknownSections] };
  });

  revalidatePath("/students");
  const notes = [
    outcome.skipped.length > 0
      ? `${outcome.skipped.length} already on file and left as they were.`
      : null,
    outcome.unknownSections.length > 0
      ? `No section called ${outcome.unknownSections.join(", ")}; those students are not placed yet.`
      : null,
  ].filter(Boolean);
  return {
    ok: `${outcome.added} students imported. ${notes.join(" ")} Print their activation codes from the class list.`.replace(
      /\s+/g,
      " ",
    ),
  };
}
