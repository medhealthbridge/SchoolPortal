import "../src/db/load-env";
import { afterAll, describe, expect, it } from "vitest";
import { withTenant } from "@/db";
import { assessmentScores, assessments, gradingPeriods, userRoles } from "@/db/schema";
import { classRecord, mayKeepRecord } from "@/modules/grades/class-record";
import type { Role } from "@/lib/roles";
import { dropSchool, makeSchool } from "./helpers";

const made: string[] = [];
afterAll(async () => {
  for (const id of made) await dropSchool(id);
});

describe("the class record", () => {
  it("computes each learner's quarter from raw scores, and only the class's teacher keeps it", async () => {
    const t = await makeSchool();
    made.push(t.school.id);
    const sid = t.school.id;
    const other = await makeSchool();
    made.push(other.school.id);

    const out = await withTenant(sid, async (tx) => {
      const [period] = await tx
        .insert(gradingPeriods)
        .values({ schoolId: sid, schoolYearId: t.year.id, name: "Q1", sequence: 1, startsOn: "2026-06-01", endsOn: "2026-08-31" })
        .returning();
      const add = (component: "ww" | "pt" | "qa", title: string, highestScore: number) =>
        tx
          .insert(assessments)
          .values({ schoolId: sid, sectionId: t.section.id, subjectId: t.subject.id, gradingPeriodId: period.id, component, title, highestScore })
          .returning()
          .then((r) => r[0]);
      const ww = await add("ww", "Quiz 1", 50);
      const pt = await add("pt", "Report", 50);
      const qa = await add("qa", "Exam", 40);
      const s0 = t.students[0].id;
      await tx.insert(assessmentScores).values([
        { schoolId: sid, assessmentId: ww.id, studentId: s0, raw: 40 },
        { schoolId: sid, assessmentId: pt.id, studentId: s0, raw: 45 },
        { schoolId: sid, assessmentId: qa.id, studentId: s0, raw: 30 },
      ]);
      const record = await classRecord(tx, sid, t.section.id, t.subject.id, period.id);
      const roles = (await tx.select().from(userRoles)).filter((r) => r.userId === t.teacher.id).map((r) => r.role as Role);
      return {
        record,
        teacherMay: await mayKeepRecord(tx, sid, { userId: t.teacher.id, roles }, t.section.id, t.subject.id),
        otherTeacherMay: await mayKeepRecord(tx, sid, { userId: other.teacher.id, roles: ["teacher"] }, t.section.id, t.subject.id),
        parentMay: await mayKeepRecord(tx, sid, { userId: t.parent.id, roles: ["parent"] }, t.section.id, t.subject.id),
      };
    });

    expect(out.record.rows).toHaveLength(3);
    const first = out.record.rows.find((r) => r.studentId === t.students[0].id)!;
    // Languages group (default): 80×.3 + 90×.5 + 75×.2 = 84 → 90
    expect(first.line.initial).toBe(84);
    expect(first.line.quarterly).toBe(90);
    // Nothing entered counts as zero: 0 → 60.
    expect(out.record.rows.find((r) => r.studentId === t.students[1].id)!.line.quarterly).toBe(60);
    expect(out.teacherMay).toBe(true);
    expect(out.otherTeacherMay).toBe(false);
    expect(out.parentMay).toBe(false);
  });
});
