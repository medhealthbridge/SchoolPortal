import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, withPlatform } from "@/db";
import { invoices, platformAdmins, schoolModules, schools } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { activeStudentCount, issueInvoices, markPastDue, recordPayment } from "@/lib/invoicing";
import { enabledModules, applyTierModules } from "@/lib/tenant";
import { monthlyInvoice } from "@/lib/pricing";
import { dropSchool, makeSchool } from "./helpers";

describe("platform billing and suspension", () => {
  let s: Awaited<ReturnType<typeof makeSchool>>;
  let adminId: string;
  const period = "2026-11";

  beforeAll(async () => {
    s = await makeSchool({ tier: "starter" });
    const [admin] = await db
      .insert(platformAdmins)
      .values({
        email: `billing-test-${Date.now()}@example.test`,
        name: "Billing test admin",
        passwordHash: await hashPassword("password123"),
      })
      .returning();
    adminId = admin.id;
  });

  afterAll(async () => {
    await dropSchool(s.school.id);
    await db.delete(platformAdmins).where(eq(platformAdmins.id, adminId));
  });

  it("counts students with an active enrollment in the current year", async () => {
    expect(await activeStudentCount(s.school.id)).toBe(3);
  });

  it("issues one invoice per school and never twice for the same month", async () => {
    await issueInvoices(period);
    await issueInvoices(period);
    const rows = await withPlatform((tx) =>
      tx.select().from(invoices).where(eq(invoices.schoolId, s.school.id)),
    );
    const forPeriod = rows.filter((r) => r.period === period);
    expect(forPeriod).toHaveLength(1);

    const expected = monthlyInvoice("starter", [], 3);
    expect(forPeriod[0].totalCentavos).toBe(expected.totalCentavos);
  });

  it("skips a school still on trial", async () => {
    const trial = await makeSchool({ tier: "starter" });
    await withPlatform((tx) =>
      tx.update(schools).set({ status: "trial" }).where(eq(schools.id, trial.school.id)),
    );
    await issueInvoices("2026-12");
    const rows = await withPlatform((tx) =>
      tx.select().from(invoices).where(eq(invoices.schoolId, trial.school.id)),
    );
    expect(rows).toHaveLength(0);
    await dropSchool(trial.school.id);
  });

  it("marks an overdue invoice past due without blocking anyone", async () => {
    await markPastDue("2027-01-01");
    const [school] = await withPlatform((tx) =>
      tx.select().from(schools).where(eq(schools.id, s.school.id)),
    );
    expect(school.status).toBe("past_due");
  });

  it("recording the payment clears past due", async () => {
    const [invoice] = await withPlatform((tx) =>
      tx.select().from(invoices).where(eq(invoices.schoolId, s.school.id)),
    );
    const result = await recordPayment({
      invoiceId: invoice.id,
      amountCentavos: invoice.totalCentavos,
      method: "bank_transfer",
      adminId,
      adminName: "test",
      paidOn: "2027-01-02",
    });
    expect(result).toMatchObject({ ok: true });

    const [after] = await withPlatform((tx) =>
      tx.select().from(schools).where(eq(schools.id, s.school.id)),
    );
    expect(after.status).toBe("active");
    const [paid] = await withPlatform((tx) =>
      tx.select().from(invoices).where(eq(invoices.id, invoice.id)),
    );
    expect(paid.status).toBe("paid");
  });

  it("a tier switch hides modules and keeps their rows", async () => {
    await applyTierModules(s.school.id, "all_in");
    expect((await enabledModules(s.school.id)).has("grades")).toBe(true);

    await applyTierModules(s.school.id, "starter");
    const on = await enabledModules(s.school.id);
    expect(on.has("grades")).toBe(false);
    expect(on.has("attendance")).toBe(true);

    // The row stays; only `enabled` moved.
    const rows = await withPlatform((tx) =>
      tx.select().from(schoolModules).where(eq(schoolModules.schoolId, s.school.id)),
    );
    expect(rows.find((r) => r.moduleKey === "grades")).toBeDefined();
  });
});
