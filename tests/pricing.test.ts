import { describe, expect, it } from "vitest";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import {
  PER_STUDENT_CENTAVOS,
  PLATFORM_FEE_CAP_CENTAVOS,
  TIERS,
  modulesForTier,
  monthlyInvoice,
  platformFeeCentavos,
  proratedUpgradeCentavos,
  yearTotalCentavos,
} from "@/lib/pricing";

const PESO = 100;

describe("pricing", () => {
  it("matches the plan's example schools", () => {
    expect(yearTotalCentavos("starter", 300)).toBe(92_000 * PESO);
    expect(yearTotalCentavos("academic", 800)).toBe(232_000 * PESO);
    expect(yearTotalCentavos("all_in", 1500)).toBe(440_000 * PESO);
  });

  /** The whole price list is the cap, split across the modules. */
  it("adds the eleven modules up to exactly the ₱80,000 cap", () => {
    const parts = MODULE_KEYS.reduce((sum, k) => sum + MODULES[k].priceCentavos, 0);
    expect(parts).toBe(80_000 * PESO);
    expect(PLATFORM_FEE_CAP_CENTAVOS).toBe(parts);
  });

  it("prices each tier at what its own modules cost", () => {
    for (const tier of ["starter", "academic", "student_life", "all_in"] as const) {
      const parts = modulesForTier(tier).reduce(
        (sum, m) => sum + MODULES[m].priceCentavos,
        0,
      );
      expect(TIERS[tier].platformFeeCentavos, tier).toBe(parts);
    }
    expect(TIERS.all_in.platformFeeCentavos).toBe(80_000 * PESO);
  });

  it("each tier includes the one below it", () => {
    expect(modulesForTier("starter")).toEqual(["core", "attendance"]);
    expect(modulesForTier("academic")).toContain("attendance");
    expect(modulesForTier("all_in")).toHaveLength(11);
  });

  it("caps the platform fee at ₱80,000 however many modules are added", () => {
    const fee = platformFeeCentavos("student_life", [
      "registrar",
      "billing",
      "analytics",
      "grades",
    ]);
    expect(fee).toBe(PLATFORM_FEE_CAP_CENTAVOS);
  });

  it("charges a module already in the tier only once", () => {
    expect(platformFeeCentavos("academic", ["grades"])).toBe(
      TIERS.academic.platformFeeCentavos,
    );
  });

  it("bills a twelfth of the yearly fee plus ₱20 per student per month", () => {
    const lines = monthlyInvoice("starter", [], 300);
    expect(lines.platformFeeCentavos).toBe(Math.round(2_000_000 / 12));
    expect(lines.studentFeeCentavos).toBe(300 * PER_STUDENT_CENTAVOS);
    expect(lines.totalCentavos).toBe(lines.platformFeeCentavos + lines.studentFeeCentavos);
  });

  it("prorates an upgrade over the months left and never refunds a downgrade", () => {
    expect(proratedUpgradeCentavos("starter", "academic", 6)).toBe(1_000_000);
    expect(proratedUpgradeCentavos("all_in", "starter", 6)).toBe(0);
  });
});
