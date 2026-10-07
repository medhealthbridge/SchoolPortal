"use server";

import { withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { applicationStatus, parseApplication, submitApplication } from "@/lib/enrolment";
import { deliver } from "@/lib/messaging";
import { clientIp } from "@/lib/request";
import { currentSchool } from "@/lib/session";
import { attempt, retryMessage, SIGNUP } from "@/lib/throttle";

export type EnrolResult = { reference?: string; error?: string; issues?: string[] } | null;

export async function applyOnline(_prev: EnrolResult, form: FormData): Promise<EnrolResult> {
  const school = await currentSchool();
  if (!school) return { error: "Unknown school." };
  if (school.status === "suspended" || !school.enrolmentOpen)
    return { error: `${school.name} is not taking applications online right now. Contact the school office.` };
  const limit = await attempt(`enrol:${school.id}:${await clientIp()}`, SIGNUP);
  if (!limit.allowed) return { error: retryMessage(limit.retryInSeconds) };

  const parsed = parseApplication(Object.fromEntries(form.entries()));
  if (parsed.errors) return { error: "Check the form: nothing was sent yet.", issues: parsed.errors };
  const v = parsed.value;

  const row = await withTenant(school.id, async (tx) => {
    const saved = await submitApplication(tx, school.id, v);
    await audit(tx, {
      schoolId: school.id,
      actorLabel: `${v.guardianName} (online application)`,
      action: "enrolment.applied",
      entity: "enrolment_applications",
      entityId: saved.id,
      after: { reference: saved.reference, gradeLevel: v.gradeLevel },
    });
    return saved;
  });
  const learner = `${v.learner.first_name} ${v.learner.last_name}`;
  const text = `${school.name} received the enrolment application for ${learner} (${v.gradeLevel}). Reference ${row.reference}. The registrar will contact you.`;
  await deliver({ schoolId: school.id, channel: "sms", to: v.guardianPhone, body: text });
  if (v.guardianEmail)
    await deliver({ schoolId: school.id, channel: "email", to: v.guardianEmail, subject: `Application received: ${learner}`, body: text });
  return { reference: row.reference };
}

export type StatusResult = { status?: string; learner?: string; note?: string | null; error?: string } | null;

export async function checkStatus(_prev: StatusResult, form: FormData): Promise<StatusResult> {
  const school = await currentSchool();
  if (!school) return { error: "Unknown school." };
  const limit = await attempt(`enrol-status:${school.id}:${await clientIp()}`, SIGNUP);
  if (!limit.allowed) return { error: retryMessage(limit.retryInSeconds) };
  const row = await withTenant(school.id, (tx) =>
    applicationStatus(tx, school.id, String(form.get("reference") ?? ""), String(form.get("phone") ?? "")),
  );
  if (!row) return { error: "No application matches that reference and mobile number." };
  const l = row.learner as Record<string, string>;
  return { status: row.status, learner: `${l.first_name} ${l.last_name}`, note: row.decisionNote };
}
