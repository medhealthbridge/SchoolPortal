import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { students } from "@/db/schema";
import { dropSchool, makeSchool } from "./helpers";

/**
 * The release gate the plan asks for: log in as school A and try to read
 * school B. Row-level security has to stop it even when the query forgets to
 * filter on school_id.
 */
describe("tenant isolation", () => {
  let a: Awaited<ReturnType<typeof makeSchool>>;
  let b: Awaited<ReturnType<typeof makeSchool>>;

  beforeAll(async () => {
    a = await makeSchool();
    b = await makeSchool();
  });

  afterAll(async () => {
    await dropSchool(a.school.id);
    await dropSchool(b.school.id);
  });

  it("a query with no school filter still sees only its own school", async () => {
    const rows = await withTenant(a.school.id, (tx) => tx.select().from(students));
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.schoolId === a.school.id)).toBe(true);
  });

  it("asking for another school's row by id returns nothing", async () => {
    const target = b.students[0].id;
    const rows = await withTenant(a.school.id, (tx) =>
      tx.select().from(students).where(eq(students.id, target)),
    );
    expect(rows).toHaveLength(0);
  });

  it("cannot write a row belonging to another school", async () => {
    const attempt = withTenant(a.school.id, (tx) =>
      tx.insert(students).values({
        schoolId: b.school.id,
        studentNumber: "SMUGGLED",
        firstName: "Not",
        lastName: "Allowed",
        activationCode: "AAAAAAAA",
        parentCode: "BBBBBBBB",
      }),
    );
    const error = await attempt.then(
      () => null,
      (e: Error & { cause?: Error }) => e,
    );
    expect(error).not.toBeNull();
    // Drizzle wraps the driver error; the policy violation is the cause.
    expect(`${error?.message} ${error?.cause?.message ?? ""}`).toMatch(
      /row-level security/i,
    );
  });

  it("cannot update another school's row", async () => {
    const target = b.students[0].id;
    await withTenant(a.school.id, (tx) =>
      tx.update(students).set({ lastName: "Tampered" }).where(eq(students.id, target)),
    );
    const [after] = await withTenant(b.school.id, (tx) =>
      tx.select().from(students).where(eq(students.id, target)),
    );
    expect(after.lastName).not.toBe("Tampered");
  });

  it("the same student number can exist in two schools", async () => {
    const aRows = await withTenant(a.school.id, (tx) => tx.select().from(students));
    const bRows = await withTenant(b.school.id, (tx) => tx.select().from(students));
    expect(aRows[0].studentNumber).toBe(bRows[0].studentNumber);
    expect(aRows[0].id).not.toBe(bRows[0].id);
  });
});
