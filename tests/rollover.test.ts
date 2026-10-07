import "../src/db/load-env";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { enrollments, gradingPeriods, schoolYears, scores, sections } from "@/db/schema";
import { applyRollover, nextLevel, planRollover } from "@/lib/rollover";
import { dropSchool, makeSchool } from "./helpers";

const made: string[] = [];
afterAll(async () => {
  for (const id of made) await dropSchool(id);
});

describe("the next level", () => {
  it.each([
    ["Grade 7", "Grade 8"],
    ["Grade 11", "Grade 12"],
    ["Kinder", "Grade 1"],
    ["Grade 12", null],
    ["Nursery", undefined],
  ])("%s → %s", (from, to) => expect(nextLevel(from)).toBe(to));
});

describe("starting the next school year", () => {
  it("promotes, keeps back below 75, honours an override, and leaves last year intact", async () => {
    const t = await makeSchool();
    made.push(t.school.id);
    const sid = t.school.id;
    const [a, bStudent, c] = t.students;

    const result = await withTenant(sid, async (tx) => {
      const [p] = await tx
        .insert(gradingPeriods)
        .values({ schoolId: sid, schoolYearId: t.year.id, name: "Q1", sequence: 1, startsOn: "2026-06-01", endsOn: "2026-08-31" })
        .returning();
      await tx.insert(scores).values([
        { schoolId: sid, gradingPeriodId: p.id, studentId: a.id, subjectId: t.subject.id, score: 88 },
        { schoolId: sid, gradingPeriodId: p.id, studentId: bStudent.id, subjectId: t.subject.id, score: 70 },
        { schoolId: sid, gradingPeriodId: p.id, studentId: c.id, subjectId: t.subject.id, score: 72 },
      ]);
      const plan = await planRollover(tx, sid);
      const done = await applyRollover(tx, sid, {
        name: "Next year",
        startsOn: "2027-06-01",
        endsOn: "2028-03-31",
        overrides: new Map([[c.id, "promoted" as const]]),
      });
      const [year] = await tx.select().from(schoolYears).where(and(eq(schoolYears.schoolId, sid), eq(schoolYears.isCurrent, true)));
      const now = await tx
        .select({ studentId: enrollments.studentId, level: sections.level, status: enrollments.status })
        .from(enrollments)
        .innerJoin(sections, eq(sections.id, enrollments.sectionId))
        .where(and(eq(enrollments.schoolId, sid), eq(enrollments.schoolYearId, year.id)));
      const before = await tx
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.schoolId, sid), eq(enrollments.schoolYearId, t.year.id)));
      const again = await applyRollover(tx, sid, { name: "Next year", startsOn: "2027-06-01", endsOn: "2028-03-31" });
      return { plan, done, year, now, before, again };
    });

    expect(result.plan!.lines.find((l) => l.studentId === bStudent.id)!.outcome).toBe("retained");
    expect("counts" in result.done && result.done.counts).toEqual({ promoted: 2, retained: 1, graduated: 0 });
    expect(result.year.name).toBe("Next year");
    const level = (id: string) => result.now.find((r) => r.studentId === id)!.level;
    const from = t.section.level;
    expect(level(a.id)).toBe(nextLevel(from) ?? from);
    expect(level(bStudent.id)).toBe(from);
    expect(level(c.id)).toBe(nextLevel(from) ?? from);
    expect(result.now.every((r) => r.status === "active")).toBe(true);
    expect(result.before.map((r) => r.status).sort()).toEqual(["promoted", "promoted", "retained"]);
    expect("error" in result.again).toBe(true);
  });
});
