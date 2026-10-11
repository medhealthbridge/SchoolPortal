import { MODULES, type ModuleKey } from "./modules";

export type TierKey = "starter" | "academic" | "student_life" | "all_in";

export type Tier = {
  key: TierKey;
  name: string;
  /** Yearly platform fee, in centavos. */
  platformFeeCentavos: number;
  modules: ModuleKey[];
};

/** A tier includes every module of the tier below it. */
const TIER_ADDS: Record<TierKey, ModuleKey[]> = {
  starter: ["core", "attendance"],
  academic: ["grades", "portal"],
  student_life: ["discipline", "guidance", "sao", "chaplain"],
  all_in: ["registrar", "billing", "analytics"],
};

const TIER_ORDER: TierKey[] = ["starter", "academic", "student_life", "all_in"];

const TIER_FEES: Record<TierKey, number> = {
  starter: 2_500_000,
  academic: 5_000_000,
  student_life: 7_000_000,
  all_in: 10_000_000,
};

/** The platform fee never goes above ₱100,000. */
export const PLATFORM_FEE_CAP_CENTAVOS = 10_000_000;

/** ₱20 per active student per month. */
export const PER_STUDENT_CENTAVOS = 2_000;

export const TIERS: Record<TierKey, Tier> = Object.fromEntries(
  TIER_ORDER.map((key, i) => [
    key,
    {
      key,
      name: {
        starter: "Starter",
        academic: "Academic",
        student_life: "Student Life",
        all_in: "All-in",
      }[key],
      platformFeeCentavos: TIER_FEES[key],
      modules: TIER_ORDER.slice(0, i + 1).flatMap((k) => TIER_ADDS[k]),
    } satisfies Tier,
  ]),
) as Record<TierKey, Tier>;

export const TIER_LIST = TIER_ORDER.map((k) => TIERS[k]);

export function modulesForTier(tier: TierKey): ModuleKey[] {
  return TIERS[tier].modules;
}

/**
 * A school on a lower tier can add any single module at its listed price, and
 * the platform fee is still capped at ₱100,000.
 */
export function platformFeeCentavos(tier: TierKey, extraModules: ModuleKey[] = []) {
  const included = new Set(modulesForTier(tier));
  const extras = extraModules.filter((m) => !included.has(m));
  const raw =
    TIERS[tier].platformFeeCentavos +
    extras.reduce((sum, m) => sum + MODULES[m].priceCentavos, 0);
  return Math.min(raw, PLATFORM_FEE_CAP_CENTAVOS);
}

export type InvoiceLines = {
  platformFeeCentavos: number;
  studentFeeCentavos: number;
  totalCentavos: number;
};

/**
 * One month's invoice: a twelfth of the yearly platform fee plus ₱20 for each
 * student with an active enrollment on the 1st.
 */
export function monthlyInvoice(
  tier: TierKey,
  extraModules: ModuleKey[],
  studentCount: number,
  perStudentCentavos = PER_STUDENT_CENTAVOS,
): InvoiceLines {
  const yearly = platformFeeCentavos(tier, extraModules);
  const platform = Math.round(yearly / 12);
  const students = studentCount * perStudentCentavos;
  return {
    platformFeeCentavos: platform,
    studentFeeCentavos: students,
    totalCentavos: platform + students,
  };
}

/** What a school pays across a full year, as shown on the pricing page. */
export function yearTotalCentavos(
  tier: TierKey,
  studentCount: number,
  extraModules: ModuleKey[] = [],
  perStudentCentavos = PER_STUDENT_CENTAVOS,
) {
  return (
    platformFeeCentavos(tier, extraModules) +
    studentCount * perStudentCentavos * 12
  );
}

/** An upgrade mid-year is charged pro rata for the months left. */
export function proratedUpgradeCentavos(
  from: TierKey,
  to: TierKey,
  monthsLeft: number,
) {
  const delta = TIERS[to].platformFeeCentavos - TIERS[from].platformFeeCentavos;
  if (delta <= 0) return 0;
  return Math.round((delta * Math.max(0, Math.min(12, monthsLeft))) / 12);
}

export function peso(centavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(centavos / 100);
}
