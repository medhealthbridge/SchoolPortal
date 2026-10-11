/**
 * Starting the next school year.
 *
 * Every section is carried into the new year one level up, under the same
 * name. Each learner moves with their section: promoted if their general
 * average is 75 or more (or nothing was graded), kept at their level if it is
 * below, and graduated out of the top grade. Last year's enrolments, grades
 * and attendance stay where they are, marked with what happened. The
 * timetable is not copied: teachers and rooms change from year to year.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db";
import { enrollments, gradingPeriods, schoolYears, scores, sections, students } from "@/db/schema";
import { PASSING_SCORE } from "@/modules/grades/queries";
import { currentYear } from "./schedule";

export const TOP_LEVEL = 12;

/** "Grade 7" → "Grade 8"; "Kinder" → "Grade 1"; "Grade 12" → null (graduates). */
export function nextLevel(level: string): string | null | undefined {
  const t = level.trim();
  if (/^kinder(garten)?$/i.test(t) || /^k$/i.test(t)) return "Grade 1";
  const m = /^(.*?)(\d+)\s*$/.exec(t);
  if (!m) return undefined; // cannot tell: kept at the same level
  const n = Number(m[2]);
  if (n >= TOP_LEVEL) return null;
  return `${m[1]}${n + 1}`;
}

export type Outcome = "promoted" | "retained" | "graduated";

export type PlanLine = {
  studentId: string;
  name: string;
  fromLevel: string;
  section: string;
  average: number | null;
  outcome: Outcome;
  toLevel: string | null;
};

/** What starting the next year would do, without doing it. */
export async function planRollover(tx: Tx, schoolId: string) {
  const year = await currentYear(tx, schoolId);
  if (!year) return null;

  const rows = await tx
    .select({ e: enrollments, s: students, sec: sections })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .where(
      and(eq(enrollments.schoolId, schoolId), eq(enrollments.schoolYearId, year.id), eq(enrollments.status, "active")),
    );

  const periods = await tx
    .select({ id: gradingPeriods.id })
    .from(gradingPeriods)
    .where(and(eq(gradingPeriods.schoolId, schoolId), eq(gradingPeriods.schoolYearId, year.id)));
  const marks = periods.length
    ? await tx
        .select({ studentId: scores.studentId, subjectId: scores.subjectId, score: scores.score })
        .from(scores)
        .where(
          and(
            eq(scores.schoolId, schoolId),
            inArray(
              scores.gradingPeriodId,
              periods.map((p) => p.id),
            ),
          ),
        )
    : [];

  // The general average as on the report card: each subject's mean, then the mean of those.
  const average = (studentId: string) => {
    const bySubject = new Map<string, number[]>();
    for (const m of marks.filter((x) => x.studentId === studentId))
      bySubject.set(m.subjectId, [...(bySubject.get(m.subjectId) ?? []), m.score]);
    const finals = [...bySubject.values()].map((v) => Math.round(v.reduce((a, b) => a + b, 0) / v.length));
    return finals.length ? Math.round(finals.reduce((a, b) => a + b, 0) / finals.length) : null;
  };

  const lines: PlanLine[] = rows.map(({ s, sec }) => {
    const avg = average(s.id);
    const next = nextLevel(sec.level);
    const passed = avg === null || avg >= PASSING_SCORE;
    let outcome: Outcome;
    let toLevel: string | null;
    if (!passed) {
      outcome = "retained";
      toLevel = sec.level;
    } else if (next === null) {
      outcome = "graduated";
      toLevel = null;
    } else {
      outcome = "promoted";
      toLevel = next ?? sec.level;
    }
    return {
      studentId: s.id,
      name: `${s.lastName}, ${s.firstName}`,
      fromLevel: sec.level,
      section: sec.name,
      average: avg,
      outcome,
      toLevel,
    };
  });
  lines.sort((a, b) => a.fromLevel.localeCompare(b.fromLevel, undefined, { numeric: true }) || a.name.localeCompare(b.name));

  const allSections = await tx
    .select()
    .from(sections)
    .where(and(eq(sections.schoolId, schoolId), eq(sections.schoolYearId, year.id)));
  return { year, lines, sections: allSections };
}

/**
 * Does it. `overrides` lets the office change a learner's outcome first
 * (a learner who passed remedial classes, say).
 */
export async function applyRollover(
  tx: Tx,
  schoolId: string,
  input: { name: string; startsOn: string; endsOn: string; overrides?: Map<string, Outcome> },
) {
  const plan = await planRollover(tx, schoolId);
  if (!plan) return { error: "There is no current school year to roll over from." } as const;
  if (plan.year.name === input.name) return { error: `${input.name} is already the current year.` } as const;

  const [existing] = await tx
    .select()
    .from(schoolYears)
    .where(and(eq(schoolYears.schoolId, schoolId), eq(schoolYears.name, input.name)))
    .limit(1);
  if (existing) return { error: `${input.name} already exists. Choose another name.` } as const;

  await tx.update(schoolYears).set({ isCurrent: false }).where(eq(schoolYears.schoolId, schoolId));
  const [year] = await tx
    .insert(schoolYears)
    .values({ schoolId, name: input.name, startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: true })
    .returning();

  // New sections, made as needed: (level, name) → id.
  const made = new Map<string, string>();
  const sectionFor = async (level: string, name: string, branchId: string | null) => {
    const key = `${level}|${name}`;
    const found = made.get(key);
    if (found) return found;
    const [row] = await tx
      .insert(sections)
      .values({ schoolId, schoolYearId: year.id, level, name, branchId })
      .returning();
    made.set(key, row.id);
    return row.id;
  };
  // Every section carries forward a level, even an empty one, so the office starts from last year's shape.
  for (const sec of plan.sections) {
    const next = nextLevel(sec.level);
    if (next !== null) await sectionFor(next ?? sec.level, sec.name, sec.branchId);
  }

  const counts = { promoted: 0, retained: 0, graduated: 0 };
  for (const line of plan.lines) {
    const outcome = input.overrides?.get(line.studentId) ?? line.outcome;
    const oldSection = plan.sections.find((s) => s.level === line.fromLevel && s.name === line.section)!;
    await tx
      .update(enrollments)
      .set({ status: outcome })
      .where(
        and(
          eq(enrollments.schoolId, schoolId),
          eq(enrollments.studentId, line.studentId),
          eq(enrollments.schoolYearId, plan.year.id),
        ),
      );
    counts[outcome] += 1;
    if (outcome === "graduated") continue;
    const level = outcome === "retained" ? line.fromLevel : (nextLevel(line.fromLevel) ?? line.fromLevel);
    const sectionId = await sectionFor(level, line.section, oldSection.branchId);
    await tx.insert(enrollments).values({ schoolId, studentId: line.studentId, sectionId, schoolYearId: year.id });
  }

  return { year, counts, sections: made.size } as const;
}
