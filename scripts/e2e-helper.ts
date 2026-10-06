/**
 * Small database chores for the browser checks, run against the seeded St. Mary.
 *
 *   npx tsx scripts/e2e-helper.ts section "Grade 8" Rizal   → prints the section id
 *   npx tsx scripts/e2e-helper.ts parent-code ST-2026-0001  → prints that student's parent code
 */
import "../src/db/load-env";
import { and, eq } from "drizzle-orm";
import { db, withTenant } from "../src/db";
import { schoolYears, schools, sections, students } from "../src/db/schema";

const [cmd, a, b] = process.argv.slice(2);
const [school] = await db.select().from(schools).where(eq(schools.subdomain, "stmary"));
if (!school) throw new Error("Seed first");

await withTenant(school.id, async (tx) => {
  if (cmd === "section") {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)));
    const [found] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.level, a!), eq(sections.name, b!)));
    const row =
      found ??
      (await tx
        .insert(sections)
        .values({ schoolId: school.id, schoolYearId: year!.id, level: a!, name: b! })
        .returning())[0];
    console.log(row!.id);
  } else if (cmd === "parent-code") {
    const [s] = await tx
      .select()
      .from(students)
      .where(and(eq(students.schoolId, school.id), eq(students.studentNumber, a!)));
    console.log(s?.parentCode ?? "");
  }
});
process.exit(0);
