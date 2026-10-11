/**
 * What a teacher can note about a student beyond present or absent: the
 * uniform and grooming checks a Philippine school does at the door.
 *
 * These only record what was seen. Nothing opens a discipline case; the
 * office reads them from the student's record and decides.
 */
/** `short` sits in the class list beside P A L E, where there is no room for words. */
export const CHECKS = [
  { key: "uniform", label: "Improper uniform", short: "U" },
  { key: "id", label: "No ID", short: "ID" },
] as const;

/** None → improper uniform → no ID → none, as one button cycles. */
export const CHECK_CYCLE = [null, "uniform", "id"] as const;

export function nextCheck(current: string | null | undefined) {
  const at = CHECK_CYCLE.indexOf((current ?? null) as (typeof CHECK_CYCLE)[number]);
  return CHECK_CYCLE[(at + 1) % CHECK_CYCLE.length] ?? null;
}

export function checkShort(key: string | null | undefined) {
  return CHECKS.find((c) => c.key === key)?.short;
}

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
