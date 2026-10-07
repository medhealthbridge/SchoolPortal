import { afterAll, describe, expect, it } from "vitest";
import { withTenant } from "@/db";
import { EXPORTS, chooseColumns } from "@/lib/export/datasets";
import { dropSchool, makeSchool } from "./helpers";

describe("export datasets", () => {
  const made: string[] = [];
  afterAll(async () => {
    for (const id of made) await dropSchool(id);
  });

  it("every dataset runs and fills every column it offers", async () => {
    const t = await makeSchool();
    made.push(t.school.id);
    for (const d of Object.values(EXPORTS)) {
      const rows = await withTenant(t.school.id, (tx) => d.load(tx, t.school.id, {}));
      for (const r of rows.slice(0, 5))
        for (const c of d.columns)
          expect(c.key in r, `${d.key}.${c.key} missing from a row`).toBe(true);
    }
  });

  it("returns the school's own students and nobody else's", async () => {
    const a = await makeSchool();
    const b = await makeSchool();
    made.push(a.school.id, b.school.id);
    const rows = await withTenant(a.school.id, (tx) =>
      EXPORTS.students.load(tx, a.school.id, {}),
    );
    const other = await withTenant(b.school.id, (tx) =>
      EXPORTS.students.load(tx, b.school.id, {}),
    );
    expect(rows.length).toBeGreaterThan(0);
    const mine = new Set(rows.map((r) => `${r.student_number}`));
    // Student numbers repeat across test schools, so compare through RLS instead:
    // asking school A's transaction for school B's rows returns none.
    const crossed = await withTenant(a.school.id, (tx) =>
      EXPORTS.students.load(tx, b.school.id, {}),
    );
    expect(crossed).toEqual([]);
    expect(other.length).toBeGreaterThan(0);
    expect(mine.size).toBeGreaterThan(0);
  });

  it("names the permission that unlocks every restricted column", () => {
    for (const d of Object.values(EXPORTS)) {
      if (d.columns.some((c) => c.restricted)) expect(d.restrictedPermission, d.key).toBeDefined();
    }
  });

  it("drops restricted and unknown columns for a role without the permission", () => {
    const d = EXPORTS.students;
    const asked = ["student_number", "lrn", "religion", "guardian_phone", "password_hash"];
    const view = chooseColumns(d, asked, false).map((c) => c.key);
    expect(view).toEqual(["student_number"]);
    const registrar = chooseColumns(d, asked, true).map((c) => c.key);
    expect(registrar).toEqual(["student_number", "lrn", "religion", "guardian_phone"]);
  });

  it("falls back to the default columns when none are chosen", () => {
    const d = EXPORTS.students;
    const cols = chooseColumns(d, [], false).map((c) => c.key);
    expect(cols).toContain("student_number");
    expect(cols).not.toContain("religion");
    expect(cols).not.toContain("lrn");
  });

  it("keeps sensitive learner information off by default even for the registrar", () => {
    const off = EXPORTS.students.columns.filter((c) => c.off).map((c) => c.key);
    for (const k of ["religion", "ip_group", "four_ps", "disability"]) expect(off).toContain(k);
  });
});
