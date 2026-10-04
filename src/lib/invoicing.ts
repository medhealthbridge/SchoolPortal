import { and, count, eq, inArray } from "drizzle-orm";
import { withPlatform, withTenant } from "@/db";
import { enrollments, invoices, payments, schoolYears, schools, subscriptions } from "@/db/schema";
import { monthlyInvoice } from "./pricing";
import type { ModuleKey } from "./modules";
import { audit } from "./audit";
import { deliver } from "./messaging";

/** Students with an active enrollment in the current school year. */
export async function activeStudentCount(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const years = await tx
      .select({ id: schoolYears.id })
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, schoolId), eq(schoolYears.isCurrent, true)));
    if (years.length === 0) return 0;

    const [row] = await tx
      .select({ n: count() })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.schoolId, schoolId),
          eq(enrollments.status, "active"),
          inArray(
            enrollments.schoolYearId,
            years.map((y) => y.id),
          ),
        ),
      );
    return Number(row?.n ?? 0);
  });
}

/**
 * Issues one invoice per school for `period` (YYYY-MM). The student count is
 * taken when this runs, which is the 1st of the month. Re-running is safe:
 * a school that already has an invoice for the period is skipped.
 */
export async function issueInvoices(period: string, dueInDays = 15) {
  const allSchools = await withPlatform((tx) => tx.select().from(schools));
  const issued: { schoolId: string; period: string; totalCentavos: number }[] = [];

  for (const school of allSchools) {
    if (school.status === "trial") continue;

    const { sub, existing } = await withPlatform(async (tx) => ({
      sub: (
        await tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.schoolId, school.id))
          .limit(1)
      )[0],
      existing: await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.schoolId, school.id), eq(invoices.period, period))),
    }));
    if (!sub) continue;
    if (existing.length > 0) continue;

    const studentCount = await activeStudentCount(school.id);
    const lines = monthlyInvoice(
      sub.tier,
      (sub.extraModules as ModuleKey[]) ?? [],
      studentCount,
      sub.perStudentCentavos,
    );

    const dueOn = new Date(`${period}-01T00:00:00Z`);
    dueOn.setUTCDate(dueOn.getUTCDate() + dueInDays);

    await withPlatform(async (tx) => {
      const [invoice] = await tx
        .insert(invoices)
        .values({
          schoolId: school.id,
          period,
          studentCount,
          platformFeeCentavos: lines.platformFeeCentavos,
          studentFeeCentavos: lines.studentFeeCentavos,
          totalCentavos: lines.totalCentavos,
          status: "issued",
          dueOn: dueOn.toISOString().slice(0, 10),
        })
        .returning();
      await audit(tx, {
        schoolId: school.id,
        actorLabel: "platform",
        action: "invoice.issued",
        entity: "invoices",
        entityId: invoice.id,
        after: { period, total: lines.totalCentavos, studentCount },
      });
    });

    await deliver({
      schoolId: school.id,
      channel: "email",
      to: school.ownerEmail,
      subject: `Invoice for ${period}`,
      body: `${school.name}: ${studentCount} active students. Total due ${(lines.totalCentavos / 100).toFixed(2)} PHP by ${dueOn.toISOString().slice(0, 10)}.`,
    });

    issued.push({ schoolId: school.id, period, totalCentavos: lines.totalCentavos });
  }

  return issued;
}

/** You record a bank or e-wallet transfer by hand; a gateway comes later. */
export async function recordPayment(args: {
  invoiceId: string;
  amountCentavos: number;
  method: string;
  reference?: string;
  adminId: string;
  adminName: string;
  paidOn: string;
}) {
  return withPlatform(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, args.invoiceId))
      .limit(1);
    if (!invoice) return { error: "No such invoice." };

    await tx.insert(payments).values({
      schoolId: invoice.schoolId,
      invoiceId: invoice.id,
      amountCentavos: args.amountCentavos,
      method: args.method,
      reference: args.reference ?? null,
      recordedByAdminId: args.adminId,
      paidOn: args.paidOn,
    });

    await tx.update(invoices).set({ status: "paid" }).where(eq(invoices.id, invoice.id));

    // Paying clears a past-due banner; a suspended school is reactivated
    // deliberately, not as a side effect of the payment landing.
    const [school] = await tx
      .select()
      .from(schools)
      .where(eq(schools.id, invoice.schoolId))
      .limit(1);
    if (school?.status === "past_due") {
      await tx.update(schools).set({ status: "active" }).where(eq(schools.id, school.id));
    }

    await audit(tx, {
      schoolId: invoice.schoolId,
      actorLabel: args.adminName,
      action: "payment.recorded",
      entity: "invoices",
      entityId: invoice.id,
      after: { amountCentavos: args.amountCentavos, method: args.method },
    });

    return { ok: true as const };
  });
}

/** Marks overdue invoices and flags their schools, without blocking anyone. */
export async function markPastDue(today = new Date().toISOString().slice(0, 10)) {
  const open = await withPlatform((tx) =>
    tx.select().from(invoices).where(eq(invoices.status, "issued")),
  );
  const late = open.filter((i) => i.dueOn < today);

  for (const invoice of late) {
    await withPlatform(async (tx) => {
      const [school] = await tx
        .select()
        .from(schools)
        .where(eq(schools.id, invoice.schoolId))
        .limit(1);
      if (!school || school.status !== "active") return;
      await tx.update(schools).set({ status: "past_due" }).where(eq(schools.id, school.id));
      await audit(tx, {
        schoolId: school.id,
        actorLabel: "platform",
        action: "school.past_due",
        entity: "invoices",
        entityId: invoice.id,
      });
    });
  }
  return late.length;
}
