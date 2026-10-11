"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant, type Tx } from "@/db";
import { assessmentScores, assessments, gradingPeriods, scores, subjects } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit, emit } from "@/lib/audit";
import { processEvents } from "@/lib/events";
import { classRecord, mayKeepRecord } from "@/modules/grades/class-record";
import { COMPONENT_LABEL, GROUPS, type Component } from "@/modules/grades/deped";
import { PASSING_SCORE } from "@/modules/grades/queries";

type Result = { ok?: string; error?: string; issues?: string[] } | null;

const where = (sectionId: string, subjectId: string) => `/grades/${sectionId}/${subjectId}`;

async function openPeriod(tx: Tx, schoolId: string, id: string) {
  const [period] = await tx
    .select()
    .from(gradingPeriods)
    .where(and(eq(gradingPeriods.schoolId, schoolId), eq(gradingPeriods.id, id)))
    .limit(1);
  if (!period) return { error: "That grading period is not this school's." } as const;
  if (period.closedAt) return { error: `${period.name} is closed. Reopen it before changing the record.` } as const;
  return { period } as const;
}

export async function addAssessment(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("grades.enter");
  const sectionId = String(form.get("sectionId") ?? "");
  const subjectId = String(form.get("subjectId") ?? "");
  const gradingPeriodId = String(form.get("gradingPeriodId") ?? "");
  const component = String(form.get("component") ?? "") as Component;
  const title = String(form.get("title") ?? "").trim();
  const highest = Number(form.get("highestScore") ?? 0);
  const givenOn = String(form.get("givenOn") ?? "") || null;

  if (!["ww", "pt", "qa"].includes(component)) return { error: "Choose Written Work, Performance Task or Quarterly Assessment." };
  if (!title) return { error: "Name it: “Quiz 1”, “Group report”, “Quarterly exam”." };
  if (!Number.isFinite(highest) || highest <= 0 || highest > 1000)
    return { error: "The highest possible score has to be a number above 0." };

  const outcome = await withTenant(school.id, async (tx) => {
    if (!(await mayKeepRecord(tx, school.id, session, sectionId, subjectId)))
      return { error: "Only the teacher of this class keeps its record." };
    const open = await openPeriod(tx, school.id, gradingPeriodId);
    if ("error" in open) return { error: open.error };
    await tx.insert(assessments).values({
      schoolId: school.id,
      sectionId,
      subjectId,
      gradingPeriodId,
      component,
      title,
      highestScore: highest,
      givenOn,
      createdByUserId: session.userId,
    });
    return { ok: `${title} added to ${COMPONENT_LABEL[component]}.` };
  });
  revalidatePath(where(sectionId, subjectId));
  return outcome;
}

export async function removeAssessment(form: FormData) {
  const { school, session } = await requirePermission("grades.enter");
  const id = String(form.get("assessmentId") ?? "");
  const outcome = await withTenant(school.id, async (tx) => {
    const [a] = await tx
      .select()
      .from(assessments)
      .where(and(eq(assessments.schoolId, school.id), eq(assessments.id, id)))
      .limit(1);
    if (!a || !(await mayKeepRecord(tx, school.id, session, a.sectionId, a.subjectId))) return null;
    const open = await openPeriod(tx, school.id, a.gradingPeriodId);
    if ("error" in open) return null;
    await tx.delete(assessments).where(eq(assessments.id, a.id));
    return a;
  });
  if (outcome) revalidatePath(where(outcome.sectionId, outcome.subjectId));
}

/** A whole column of raw scores at once. A blank box means "not taken yet". */
export async function saveRawScores(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("grades.enter");
  const id = String(form.get("assessmentId") ?? "");

  return withTenant(school.id, async (tx) => {
    const [a] = await tx
      .select()
      .from(assessments)
      .where(and(eq(assessments.schoolId, school.id), eq(assessments.id, id)))
      .limit(1);
    if (!a) return { error: "That assessment is not this school's." };
    if (!(await mayKeepRecord(tx, school.id, session, a.sectionId, a.subjectId)))
      return { error: "Only the teacher of this class keeps its record." };
    const open = await openPeriod(tx, school.id, a.gradingPeriodId);
    if ("error" in open) return { error: open.error };

    const issues: string[] = [];
    const entries: { studentId: string; raw: number | null }[] = [];
    for (const [key, value] of form.entries()) {
      if (!key.startsWith("raw:")) continue;
      const v = String(value).trim();
      if (v === "") {
        entries.push({ studentId: key.slice(4), raw: null });
        continue;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > a.highestScore) {
        issues.push(`“${v}” is not between 0 and ${a.highestScore}.`);
        continue;
      }
      entries.push({ studentId: key.slice(4), raw: n });
    }
    if (issues.length) return { error: "Nothing was saved.", issues: issues.slice(0, 10) };

    // Only learners of this section: a forged field for another student is dropped.
    const { rows } = await classRecord(tx, school.id, a.sectionId, a.subjectId, a.gradingPeriodId);
    const roster = new Set(rows.map((r) => r.studentId));

    let saved = 0;
    for (const e of entries) {
      if (!roster.has(e.studentId)) continue;
      if (e.raw === null) {
        await tx
          .delete(assessmentScores)
          .where(and(eq(assessmentScores.assessmentId, a.id), eq(assessmentScores.studentId, e.studentId)));
        continue;
      }
      await tx
        .insert(assessmentScores)
        .values({ schoolId: school.id, assessmentId: a.id, studentId: e.studentId, raw: e.raw })
        .onConflictDoUpdate({
          target: [assessmentScores.assessmentId, assessmentScores.studentId],
          set: { raw: e.raw, updatedAt: new Date() },
        });
      saved += 1;
    }
    revalidatePath(where(a.sectionId, a.subjectId));
    return { ok: `${saved} ${saved === 1 ? "score" : "scores"} saved for ${a.title}.` };
  });
}

/**
 * Copies each learner's transmuted quarterly grade from the class record to
 * the report card. A learner whose quarter is incomplete (a component with
 * nothing given yet) is skipped and named.
 */
export async function postQuarterlyGrades(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("grades.enter");
  const sectionId = String(form.get("sectionId") ?? "");
  const subjectId = String(form.get("subjectId") ?? "");
  const gradingPeriodId = String(form.get("gradingPeriodId") ?? "");

  const result = await withTenant(school.id, async (tx) => {
    if (!(await mayKeepRecord(tx, school.id, session, sectionId, subjectId)))
      return { error: "Only the teacher of this class keeps its record." };
    const open = await openPeriod(tx, school.id, gradingPeriodId);
    if ("error" in open) return { error: open.error };

    const record = await classRecord(tx, school.id, sectionId, subjectId, gradingPeriodId);
    const missing = (["ww", "pt", "qa"] as Component[]).filter(
      (c) => !record.items.some((i) => i.component === c),
    );
    if (missing.length)
      return {
        error: `Add at least one ${missing.map((c) => COMPONENT_LABEL[c]).join(" and one ")} before posting grades.`,
      };

    let posted = 0;
    for (const r of record.rows) {
      const grade = r.line.quarterly;
      if (grade === null) continue;
      await tx
        .insert(scores)
        .values({
          schoolId: school.id,
          gradingPeriodId,
          studentId: r.studentId,
          subjectId,
          score: grade,
          enteredByUserId: session.userId,
        })
        .onConflictDoUpdate({
          target: [scores.gradingPeriodId, scores.studentId, scores.subjectId],
          set: { score: grade, enteredByUserId: session.userId, updatedAt: new Date() },
        });
      posted += 1;
      if (grade < PASSING_SCORE) {
        await emit(tx, school.id, "student.failing", {
          studentId: r.studentId,
          subjectId,
          score: grade,
          period: open.period.name,
        });
      }
    }
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "scores.posted_from_record",
      entity: "subjects",
      entityId: subjectId,
      after: { period: open.period.name, posted },
    });
    return { ok: `${posted} quarterly ${posted === 1 ? "grade" : "grades"} posted to report cards for ${open.period.name}.` };
  });

  await processEvents(school.id);
  revalidatePath(where(sectionId, subjectId));
  revalidatePath("/grades");
  return result;
}

/** Which DepEd weighting a subject uses. The school sets this once. */
export async function setGradingGroup(form: FormData) {
  const { school, session } = await requirePermission("grades.manage_periods");
  const subjectId = String(form.get("subjectId") ?? "");
  const group = String(form.get("gradingGroup") ?? "");
  const back = String(form.get("back") ?? "/grades");
  if (!(group in GROUPS)) return;
  await withTenant(school.id, async (tx) => {
    await tx
      .update(subjects)
      .set({ gradingGroup: group })
      .where(and(eq(subjects.schoolId, school.id), eq(subjects.id, subjectId)));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "subject.grading_group",
      entity: "subjects",
      entityId: subjectId,
      after: { group },
    });
  });
  revalidatePath(back.startsWith("/") ? back : "/grades");
}
