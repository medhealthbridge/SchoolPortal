"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { registrarRequests, students } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { enabledModules } from "@/lib/tenant";
import { audit, emit } from "@/lib/audit";
import { processEvents } from "@/lib/events";
import { clearanceFor } from "@/modules/registrar/clearance";

type Result = { ok?: string; error?: string; issues?: string[] } | null;

export async function openRequest(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("registrar.manage");
  const studentNumber = String(form.get("studentNumber") ?? "").trim();
  const kind = String(form.get("kind") ?? "certificate") as
    | "enrollment"
    | "transfer_out"
    | "certificate"
    | "transcript";
  const purpose = String(form.get("purpose") ?? "").trim() || null;
  if (!studentNumber) return { error: "A request needs a student ID." };

  const on = await enabledModules(school.id);

  const result = await withTenant(school.id, async (tx) => {
    const [student] = await tx
      .select()
      .from(students)
      .where(
        and(eq(students.schoolId, school.id), eq(students.studentNumber, studentNumber)),
      )
      .limit(1);
    if (!student) return { error: `No student here has the ID ${studentNumber}.` };

    const clearance = await clearanceFor(tx, school.id, student.id, on);
    const [row] = await tx
      .insert(registrarRequests)
      .values({
        schoolId: school.id,
        studentId: student.id,
        kind,
        purpose,
        status: clearance.cleared ? "cleared" : "on_hold",
        holdReason: clearance.cleared ? null : clearance.reasons.join(" "),
        handledByUserId: session.userId,
      })
      .returning();

    await emit(tx, school.id, "registrar.clearance_requested", {
      studentId: student.id,
      requestId: row.id,
      cleared: clearance.cleared,
    });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "registrar_request.opened",
      entity: "registrar_requests",
      entityId: row.id,
      after: { kind, cleared: clearance.cleared },
    });

    return clearance.cleared
      ? {
          ok: `Cleared. ${
            clearance.checked.length
              ? `Checked ${clearance.checked.join(" and ")}.`
              : "No other office is switched on, so nothing was checked."
          }`,
        }
      : { error: "On hold.", issues: clearance.reasons };
  });

  await processEvents(school.id);
  revalidatePath("/registrar");
  return result;
}

/** Re-asks the other offices — the button a registrar presses after a payment. */
export async function recheckRequest(form: FormData) {
  const { school, session } = await requirePermission("registrar.manage");
  const requestId = String(form.get("requestId") ?? "");
  if (!requestId) return;
  const on = await enabledModules(school.id);

  await withTenant(school.id, async (tx) => {
    const [request] = await tx
      .select()
      .from(registrarRequests)
      .where(
        and(
          eq(registrarRequests.schoolId, school.id),
          eq(registrarRequests.id, requestId),
        ),
      )
      .limit(1);
    if (!request) return;

    const clearance = await clearanceFor(tx, school.id, request.studentId, on);
    await tx
      .update(registrarRequests)
      .set({
        status: clearance.cleared ? "cleared" : "on_hold",
        holdReason: clearance.cleared ? null : clearance.reasons.join(" "),
      })
      .where(eq(registrarRequests.id, requestId));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "registrar_request.rechecked",
      entity: "registrar_requests",
      entityId: requestId,
      after: { cleared: clearance.cleared },
    });
  });

  revalidatePath("/registrar");
}

export async function releaseRequest(form: FormData) {
  const { school, session } = await requirePermission("registrar.manage");
  const requestId = String(form.get("requestId") ?? "");
  if (!requestId) return;

  await withTenant(school.id, async (tx) => {
    const [request] = await tx
      .select()
      .from(registrarRequests)
      .where(
        and(
          eq(registrarRequests.schoolId, school.id),
          eq(registrarRequests.id, requestId),
        ),
      )
      .limit(1);
    // Only a cleared request is released; a hold has to be settled first.
    if (!request || request.status !== "cleared") return;

    await tx
      .update(registrarRequests)
      .set({ status: "released", releasedAt: new Date(), handledByUserId: session.userId })
      .where(eq(registrarRequests.id, requestId));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "registrar_request.released",
      entity: "registrar_requests",
      entityId: requestId,
    });
  });

  revalidatePath("/registrar");
}
