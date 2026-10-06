/**
 * The DepEd class record (DepEd Order 8, s. 2015).
 *
 * Each component's raw scores are totalled and turned into a percentage of
 * the highest possible score, weighted by the subject's group, and summed
 * into the initial grade. The transmutation table then turns that into the
 * quarterly grade that goes on the report card: 60 becomes 75, the pass mark.
 */

export type Component = "ww" | "pt" | "qa";
export const COMPONENTS: Component[] = ["ww", "pt", "qa"];
export const COMPONENT_LABEL: Record<Component, string> = {
  ww: "Written Work",
  pt: "Performance Tasks",
  qa: "Quarterly Assessment",
};

export type GradingGroup =
  | "languages"
  | "math_science"
  | "mapeh_tle"
  | "shs_core"
  | "shs_academic"
  | "shs_tvl";

/** Percent weights, WW / PT / QA. */
export const GROUPS: Record<GradingGroup, { label: string; weights: Record<Component, number> }> = {
  languages: { label: "Languages, AP, EsP (30/50/20)", weights: { ww: 30, pt: 50, qa: 20 } },
  math_science: { label: "Science, Math (40/40/20)", weights: { ww: 40, pt: 40, qa: 20 } },
  mapeh_tle: { label: "MAPEH, EPP/TLE (20/60/20)", weights: { ww: 20, pt: 60, qa: 20 } },
  shs_core: { label: "SHS core subjects (25/50/25)", weights: { ww: 25, pt: 50, qa: 25 } },
  shs_academic: { label: "SHS academic track, other subjects (25/45/30)", weights: { ww: 25, pt: 45, qa: 30 } },
  shs_tvl: { label: "SHS TVL / Sports / Arts, other subjects (20/60/20)", weights: { ww: 20, pt: 60, qa: 20 } },
};

export function groupOf(value: string | null | undefined): GradingGroup {
  return value && value in GROUPS ? (value as GradingGroup) : "languages";
}

/** A best guess from the subject's name, for a subject added without one. */
export function guessGroup(name: string): GradingGroup {
  const n = name.toLowerCase();
  if (/math|science|physics|chemistry|biology|algebra|geometry|statistic|calculus/.test(n)) return "math_science";
  if (/mapeh|music|arts?\b|physical education|\bpe\b|health|epp|tle|technology and livelihood|h\.?e\.?\b/.test(n))
    return "mapeh_tle";
  return "languages";
}

/** DepEd's transmutation table, as a formula: it has 1.6-point steps above 60 and 4-point steps below. */
export function transmute(initial: number): number {
  if (!Number.isFinite(initial)) return 60;
  const ig = Math.max(0, Math.min(100, initial));
  if (ig >= 100) return 100;
  // A hair of tolerance: 61.6 must land in the 61.60 row, not 61.5999…
  if (ig >= 60) return Math.min(99, 75 + Math.floor((ig - 60) / 1.6 + 1e-9));
  return 60 + Math.floor(ig / 4 + 1e-9);
}

/** The descriptor printed on the SF9. */
export function descriptor(grade: number): string {
  if (grade >= 90) return "Outstanding";
  if (grade >= 85) return "Very Satisfactory";
  if (grade >= 80) return "Satisfactory";
  if (grade >= 75) return "Fairly Satisfactory";
  return "Did Not Meet Expectations";
}

export const DESCRIPTORS: { range: string; label: string }[] = [
  { range: "90–100", label: "Outstanding" },
  { range: "85–89", label: "Very Satisfactory" },
  { range: "80–84", label: "Satisfactory" },
  { range: "75–79", label: "Fairly Satisfactory" },
  { range: "Below 75", label: "Did Not Meet Expectations" },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export type ComponentResult = {
  raw: number;
  highest: number;
  /** Percentage score; null when nothing has been given in this component. */
  ps: number | null;
  /** Weighted score. */
  ws: number | null;
};

export type ClassRecordLine = {
  components: Record<Component, ComponentResult>;
  initial: number | null;
  quarterly: number | null;
};

/**
 * One learner's quarter. A missing raw score on a given assessment counts as
 * zero, as in the paper record; a component with no assessments at all is
 * left out and the remaining weights are not scaled up, so an incomplete
 * quarter shows as incomplete rather than as a high grade.
 */
export function computeLine(
  weights: Record<Component, number>,
  items: { id: string; component: Component; highestScore: number }[],
  rawById: Map<string, number>,
): ClassRecordLine {
  const components = {} as Record<Component, ComponentResult>;
  let initial = 0;
  let complete = true;
  for (const c of COMPONENTS) {
    const mine = items.filter((i) => i.component === c);
    const highest = mine.reduce((a, i) => a + i.highestScore, 0);
    const raw = mine.reduce((a, i) => a + (rawById.get(i.id) ?? 0), 0);
    if (highest <= 0) {
      components[c] = { raw, highest, ps: null, ws: null };
      complete = false;
      continue;
    }
    const ps = round2((raw / highest) * 100);
    const ws = round2((ps * weights[c]) / 100);
    components[c] = { raw, highest, ps, ws };
    initial += ws;
  }
  const anything = COMPONENTS.some((c) => components[c].ps !== null);
  if (!anything) return { components, initial: null, quarterly: null };
  initial = round2(initial);
  return { components, initial, quarterly: complete ? transmute(initial) : null };
}
