"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withPlatform } from "@/db";
import { schools, subscriptions } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { applyTierModules } from "@/lib/tenant";
import { issueInvoices, markPastDue, recordPayment } from "@/lib/invoicing";
import { platformFeeCentavos } from "@/lib/pricing";
import { monthKey, todayIso } from "@/lib/format";

/**
 * Suspension never touches a table. It only changes `schools.status`, which
 * every request reads before anything else.
 */
export async function setSchoolStatus(form: FormData) {
  const admin = await requireAdmin();
  const schoolId = String(form.get("schoolId") ?? "");
  const status = String(form.get("status") ?? "") as "active" | "suspended" | "past_due";
  const reason = String(form.get("reason") ?? "").trim() || null;
  if (!schoolId || !["active", "suspended", "past_due"].includes(status)) return;

  await withPlatform(async (tx) => {
    const [before] = await tx.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
    if (!before) return;
    await tx
      .update(schools)
      .set({
        status,
        suspendedAt: status === "suspended" ? new Date() : null,
        suspendedReason: status === "suspended" ? reason : null,
      })
      .where(eq(schools.id, schoolId));
    await audit(tx, {
      schoolId,
      actorLabel: `${admin.name} (platform)`,
      action: status === "suspended" ? "school.suspended" : "school.reactivated",
      entity: "schools",
      entityId: schoolId,
      before: { status: before.status },
      after: { status, reason },
    });
  });

  revalidatePath("/");
  revalidatePath(`/schools/${schoolId}`);
}

export async function changeTier(form: FormData) {
  const admin = await requireAdmin();
  const schoolId = String(form.get("schoolId") ?? "");
  const tier = String(form.get("tier") ?? "") as "starter" | "academic" | "student_life" | "all_in";
  if (!schoolId || !tier) return;

  const fee = platformFeeCentavos(tier);
  await withPlatform(async (tx) => {
    const [before] = await tx.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
    await tx.update(schools).set({ tier }).where(eq(schools.id, schoolId));
    await tx
      .update(subscriptions)
      .set({ tier, platformFeeCentavos: fee })
      .where(eq(subscriptions.schoolId, schoolId));
    await audit(tx, {
      schoolId,
      actorLabel: `${admin.name} (platform)`,
      action: "school.tier_changed",
      entity: "schools",
      entityId: schoolId,
      before: { tier: before?.tier },
      after: { tier },
    });
  });

  await applyTierModules(schoolId, tier);
  revalidatePath(`/schools/${schoolId}`);
}

export async function runBilling() {
  await requireAdmin();
  await issueInvoices(monthKey());
  await markPastDue();
  revalidatePath("/invoices");
}

export async function markInvoicePaid(form: FormData) {
  const admin = await requireAdmin();
  const invoiceId = String(form.get("invoiceId") ?? "");
  const amount = Number(form.get("amountCentavos") ?? 0);
  const method = String(form.get("method") ?? "bank_transfer");
  const reference = String(form.get("reference") ?? "") || undefined;
  if (!invoiceId || !amount) return;

  await recordPayment({
    invoiceId,
    amountCentavos: amount,
    method,
    reference,
    adminId: admin.adminId,
    adminName: `${admin.name} (platform)`,
    paidOn: todayIso(),
  });
  revalidatePath("/invoices");
}
