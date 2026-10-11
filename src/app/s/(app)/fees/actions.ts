"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  enrollments,
  feeItems,
  schoolYears,
  sections,
  studentCharges,
  studentPayments,
  students,
} from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit, emit } from "@/lib/audit";
import { processEvents } from "@/lib/events";
import { balanceFor } from "@/modules/billing/queries";
import { todayIso } from "@/lib/format";

type Result = { ok?: string; error?: string } | null;

export async function addFeeItem(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("fees.manage");
  const name = String(form.get("name") ?? "").trim();
  const pesos = Number(form.get("amount") ?? 0);
  const level = String(form.get("level") ?? "").trim() || null;
  const dueOn = String(form.get("dueOn") ?? "") || null;
  if (!name) return { error: "A fee needs a name." };
  if (!Number.isFinite(pesos) || pesos <= 0) return { error: "Enter an amount above zero." };

  const result = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    if (!year) return { error: "Set the current school year first, in Setup." };

    await tx
      .insert(feeItems)
      .values({
        schoolId: school.id,
        schoolYearId: year.id,
        name,
        amountCentavos: Math.round(pesos * 100),
        level,
        dueOn,
      })
      .onConflictDoUpdate({
        target: [feeItems.schoolYearId, feeItems.name, feeItems.level],
        set: { amountCentavos: Math.round(pesos * 100), dueOn },
      });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "fee_item.saved",
      after: { name, pesos, level },
    });
    return { ok: `${name} saved.` };
  });

  revalidatePath("/fees");
  return result;
}

/**
 * Charges a fee to everyone it applies to. Re-running it is safe: a student
 * already charged for that fee is skipped, so nobody is billed twice.
 */
export async function chargeFee(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("fees.manage");
  const feeItemId = String(form.get("feeItemId") ?? "");
  if (!feeItemId) return { error: "Pick a fee." };

  const result = await withTenant(school.id, async (tx) => {
    const [fee] = await tx
      .select()
      .from(feeItems)
      .where(and(eq(feeItems.schoolId, school.id), eq(feeItems.id, feeItemId)))
      .limit(1);
    if (!fee) return { error: "That fee is not this school's." };

    const rows = await tx
      .select({ studentId: enrollments.studentId, level: sections.level })
      .from(enrollments)
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .where(
        and(
          eq(enrollments.schoolId, school.id),
          eq(enrollments.schoolYearId, fee.schoolYearId),
          eq(enrollments.status, "active"),
        ),
      );
    const targets = rows.filter((r) => !fee.level || r.level === fee.level);
    if (targets.length === 0)
      return { error: "Nobody is enrolled at that level this year." };

    let charged = 0;
    for (const t of targets) {
      const [row] = await tx
        .insert(studentCharges)
        .values({
          schoolId: school.id,
          studentId: t.studentId,
          feeItemId,
          amountCentavos: fee.amountCentavos,
          chargedOn: todayIso(),
        })
        .onConflictDoNothing()
        .returning();
      if (row) charged += 1;
    }

    if (charged > 0) {
      await emit(tx, school.id, "billing.balance_changed", {
        feeItemId,
        students: charged,
      });
    }
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "fee.charged",
      entity: "fee_items",
      entityId: feeItemId,
      after: { charged },
    });
    return {
      ok:
        charged === 0
          ? "Everyone it applies to was already charged."
          : `${charged} students charged ${fee.name}.`,
    };
  });

  await processEvents(school.id);
  revalidatePath("/fees");
  return result;
}

/** A payment at the window. Clearing a balance lifts any registrar hold. */
export async function recordStudentPayment(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("fees.manage");
  const studentNumber = String(form.get("studentNumber") ?? "").trim();
  const pesos = Number(form.get("amount") ?? 0);
  const method = String(form.get("method") ?? "cash");
  const receiptNo = String(form.get("receiptNo") ?? "").trim();
  if (!studentNumber || !receiptNo) return { error: "A payment needs a student ID and a receipt number." };
  if (!Number.isFinite(pesos) || pesos <= 0) return { error: "Enter an amount above zero." };

  const result = await withTenant(school.id, async (tx) => {
    const [student] = await tx
      .select()
      .from(students)
      .where(
        and(eq(students.schoolId, school.id), eq(students.studentNumber, studentNumber)),
      )
      .limit(1);
    if (!student) return { error: `No student here has the ID ${studentNumber}.` };

    await tx.insert(studentPayments).values({
      schoolId: school.id,
      studentId: student.id,
      amountCentavos: Math.round(pesos * 100),
      method,
      receiptNo,
      receivedByUserId: session.userId,
      paidOn: todayIso(),
    });

    const after = await balanceFor(tx, school.id, student.id);
    await emit(tx, school.id, "billing.balance_changed", {
      studentId: student.id,
      balanceCentavos: after.balanceCentavos,
    });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "student_payment.recorded",
      entity: "students",
      entityId: student.id,
      after: { pesos, receiptNo, balanceCentavos: after.balanceCentavos },
    });
    return {
      ok:
        after.balanceCentavos <= 0
          ? `Receipt ${receiptNo} recorded. ${student.firstName} is fully paid, so any clearance hold is lifted.`
          : `Receipt ${receiptNo} recorded. ${(after.balanceCentavos / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })} still outstanding.`,
    };
  });

  await processEvents(school.id);
  revalidatePath("/fees");
  revalidatePath("/registrar");
  return result;
}


/** The plain-form flavour, for the "Charge everyone" button in a table row. */
export async function chargeFeeAction(form: FormData) {
  await chargeFee(null, form);
}
