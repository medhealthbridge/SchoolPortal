import { describe, expect, it } from "vitest";
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
    expect(yearTotalCentavos("starter", 300)).toBe(97_000 * PESO);
    expect(yearTotalCentavos("academic", 800)).toBe(242_000 * PESO);
    expect(yearTotalCentavos("all_in", 1500)).toBe(460_000 * PESO);
  });

  it("each tier includes the one below it", () => {
    expect(modulesForTier("starter")).toEqual(["core", "attendance"]);
    expect(modulesForTier("academic")).toContain("attendance");
    expect(modulesForTier("all_in")).toHaveLength(11);
  });

  it("caps the platform fee at ₱100,000 however many modules are added", () => {
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
    expect(lines.platformFeeCentavos).toBe(Math.round(2_500_000 / 12));
    expect(lines.studentFeeCentavos).toBe(300 * PER_STUDENT_CENTAVOS);
    expect(lines.totalCentavos).toBe(lines.platformFeeCentavos + lines.studentFeeCentavos);
  });

  it("prorates an upgrade over the months left and never refunds a downgrade", () => {
    expect(proratedUpgradeCentavos("starter", "academic", 6)).toBe(1_250_000);
    expect(proratedUpgradeCentavos("all_in", "starter", 6)).toBe(0);
  });
});
