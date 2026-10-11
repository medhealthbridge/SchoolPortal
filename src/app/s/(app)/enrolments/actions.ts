"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withPlatform, withTenant } from "@/db";
import { schools } from "@/db/schema";
import { audit } from "@/lib/audit";
import { approveApplication, declineApplication } from "@/lib/enrolment";
import { requirePermission } from "@/lib/guard";
import { deliver } from "@/lib/messaging";
import { schoolUrl } from "@/lib/school-url";

export type DecideResult = { ok?: string; error?: string } | null;

export async function approve(_prev: DecideResult, form: FormData): Promise<DecideResult> {
  const { school, session } = await requirePermission("students.manage");
  const outcome = await withTenant(school.id, async (tx) => {
    const done = await approveApplication(tx, school.id, {
      applicationId: String(form.get("applicationId") ?? ""),
      studentNumber: String(form.get("studentNumber") ?? "").trim(),
      sectionId: String(form.get("sectionId") ?? ""),
      deciderId: session.userId,
      note: String(form.get("note") ?? "").trim() || null,
    });
    if ("error" in done) return done;
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "enrolment.approved",
      entity: "students",
      entityId: done.student.id,
      after: { reference: done.app.reference, studentNumber: done.student.studentNumber, section: `${done.section.level} ${done.section.name}` },
    });
    return done;
  });
  if ("error" in outcome) return { error: outcome.error };

  const { app, student, section } = outcome;
  const text = `${school.name}: ${student.firstName} ${student.lastName} is enrolled in ${section.level} ${section.name} (ref ${app.reference}). To follow grades and attendance, sign up as a parent at ${schoolUrl(school.subdomain, "/signup")} with student ID ${student.studentNumber} and parent code ${student.parentCode}.`;
  await deliver({ schoolId: school.id, channel: "sms", to: app.guardianPhone, body: text });
  if (app.guardianEmail)
    await deliver({ schoolId: school.id, channel: "email", to: app.guardianEmail, subject: `Enrolled: ${student.firstName} ${student.lastName}`, body: text });
  // No revalidate: the card stays where it is, showing what happened, rather
  // than vanishing from the waiting list mid-read. The list updates on the next visit.
  return { ok: `${student.firstName} ${student.lastName} is enrolled in ${section.level} ${section.name}. The family was sent the parent code.` };
}

export async function decline(_prev: DecideResult, form: FormData): Promise<DecideResult> {
  const { school, session } = await requirePermission("students.manage");
  const note = String(form.get("note") ?? "").trim();
  if (note.length < 5) return { error: "Tell the family why, in a sentence: they will read it." };
  const app = await withTenant(school.id, async (tx) => {
    const row = await declineApplication(tx, school.id, {
      applicationId: String(form.get("applicationId") ?? ""),
      deciderId: session.userId,
      note,
    });
    if (row)
      await audit(tx, {
        schoolId: school.id,
        actorUserId: session.userId,
        actorLabel: session.name,
        action: "enrolment.declined",
        entity: "enrolment_applications",
        entityId: row.id,
        after: { reference: row.reference, note },
      });
    return row;
  });
  if (!app) return { error: "That application was already decided." };
  const l = app.learner as Record<string, string>;
  const text = `${school.name}: the application for ${l.first_name} ${l.last_name} (ref ${app.reference}) was not approved. ${note}`;
  await deliver({ schoolId: school.id, channel: "sms", to: app.guardianPhone, body: text });
  if (app.guardianEmail)
    await deliver({ schoolId: school.id, channel: "email", to: app.guardianEmail, subject: "About your enrolment application", body: text });
  return { ok: "Declined. The family was told why." };
}

export async function setEnrolmentOpen(form: FormData) {
  const { school, session } = await requirePermission("students.manage");
  const open = form.get("open") === "1";
  await withPlatform(async (tx) => {
    await tx.update(schools).set({ enrolmentOpen: open }).where(eq(schools.id, school.id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: open ? "enrolment.opened" : "enrolment.closed",
      entity: "schools",
      entityId: school.id,
    });
  });
  revalidatePath("/enrolments");
}
