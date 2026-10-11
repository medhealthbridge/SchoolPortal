import { and, count, eq, ne } from "drizzle-orm";
import type { Tx } from "@/db";
import { incidents } from "@/db/schema";
import { balanceFor } from "@/modules/billing/queries";
import type { ModuleKey } from "@/lib/modules";
import { peso } from "@/lib/pricing";

export type Clearance = {
  cleared: boolean;
  reasons: string[];
  /** What was actually checked, so a thin answer is not mistaken for a clean one. */
  checked: string[];
};

/**
 * Clearance asks the other offices, and only the ones that are switched on.
 * A school running Registrar alone clears everybody, and says so rather than
 * implying it verified anything.
 */
export async function clearanceFor(
  tx: Tx,
  schoolId: string,
  studentId: string,
  on: Set<ModuleKey>,
): Promise<Clearance> {
  const reasons: string[] = [];
  const checked: string[] = [];

  if (on.has("billing")) {
    checked.push("school fees");
    const balance = await balanceFor(tx, schoolId, studentId);
    if (balance.balanceCentavos > 0) {
      reasons.push(`${peso(balance.balanceCentavos)} still owing to the cashier.`);
    }
  }

  if (on.has("discipline")) {
    checked.push("discipline");
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(incidents)
      .where(
        and(
          eq(incidents.schoolId, schoolId),
          eq(incidents.studentId, studentId),
          ne(incidents.status, "resolved"),
        ),
      );
    if (Number(n) > 0) {
      reasons.push(
        `${n} discipline ${Number(n) === 1 ? "case is" : "cases are"} still open.`,
      );
    }
  }

  return { cleared: reasons.length === 0, reasons, checked };
}
