/**
 * What a teacher can note about a student beyond present or absent: the
 * uniform and grooming checks a Philippine school does at the door.
 *
 * These only record what was seen. Nothing opens a discipline case; the
 * office reads them from the student's record and decides.
 */
export const CHECKS = [
  { key: "uniform", label: "Improper uniform" },
  { key: "id", label: "No ID" },
] as const;

export type CheckKey = (typeof CHECKS)[number]["key"];

const BY_KEY = new Map<string, string>(CHECKS.map((c) => [c.key, c.label]));

export const CHECK_KEYS = CHECKS.map((c) => c.key) as readonly string[];

export function isCheckKey(v: string): v is CheckKey {
  return BY_KEY.has(v);
}

/** An unknown key is dropped rather than shown raw: the list may shrink. */
export function checkLabel(key: string) {
  return BY_KEY.get(key);
}

export function checkLabels(keys: readonly string[] | null | undefined) {
  return (keys ?? []).map(checkLabel).filter((l): l is string => Boolean(l));
}
