"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { appointments, caseNotes, guidanceCases, students } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit } from "@/lib/audit";

type Result = { ok?: string; error?: string } | null;

export async function openCase(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("guidance.manage");
  const studentNumber = String(form.get("studentNumber") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const source = String(form.get("source") ?? "walk_in");
  if (!studentNumber || !title) return { error: "A case needs a student ID and a title." };

  const result = await withTenant(school.id, async (tx) => {
    const [student] = await tx
      .select()
      .from(students)
      .where(
        and(eq(students.schoolId, school.id), eq(students.studentNumber, studentNumber)),
      )
      .limit(1);
    if (!student) return { error: `No student here has the ID ${studentNumber}.` };

    const [row] = await tx
      .insert(guidanceCases)
      .values({
        schoolId: school.id,
        studentId: student.id,
        title,
        source,
        openedByUserId: session.userId,
      })
      .returning();
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "guidance_case.opened",
      entity: "guidance_cases",
      entityId: row.id,
    });
    return { ok: `Case opened for ${student.firstName} ${student.lastName}.` };
  });

  revalidatePath("/guidance");
  return result;
}

export async function addCaseNote(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("guidance.manage");
  const caseId = String(form.get("caseId") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!caseId || !body) return { error: "Pick a case and write the note." };

  const result = await withTenant(school.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(guidanceCases)
      .where(and(eq(guidanceCases.schoolId, school.id), eq(guidanceCases.id, caseId)))
      .limit(1);
    if (!row) return { error: "That case is not this school's." };

    await tx.insert(caseNotes).values({
      schoolId: school.id,
      caseId,
      body,
      authorUserId: session.userId,
    });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "guidance_note.added",
      entity: "guidance_cases",
      entityId: caseId,
    });
    return { ok: "Note added." };
  });

  revalidatePath("/guidance");
  return result;
}

export async function scheduleAppointment(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("guidance.manage");
  const caseId = String(form.get("caseId") ?? "");
  const onDate = String(form.get("onDate") ?? "");
  const atTime = String(form.get("atTime") ?? "");
  const note = String(form.get("note") ?? "").trim() || null;
  if (!caseId || !onDate || !atTime) return { error: "Pick a case, a date and a time." };

  await withTenant(school.id, async (tx) => {
    await tx
      .insert(appointments)
      .values({ schoolId: school.id, caseId, onDate, atTime, note });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "guidance_appointment.scheduled",
      entity: "guidance_cases",
      entityId: caseId,
    });
  });

  revalidatePath("/guidance");
  return { ok: "Appointment scheduled." };
}

export async function setCaseStatus(form: FormData) {
  const { school, session } = await requirePermission("guidance.manage");
  const caseId = String(form.get("caseId") ?? "");
  const status = String(form.get("status") ?? "") as "open" | "monitoring" | "closed";
  if (!caseId || !["open", "monitoring", "closed"].includes(status)) return;

  await withTenant(school.id, async (tx) => {
    await tx
      .update(guidanceCases)
      .set({ status, closedAt: status === "closed" ? new Date() : null })
      .where(and(eq(guidanceCases.schoolId, school.id), eq(guidanceCases.id, caseId)));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: `guidance_case.${status}`,
      entity: "guidance_cases",
      entityId: caseId,
    });
  });
  revalidatePath("/guidance");
}
