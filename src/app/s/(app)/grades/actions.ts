"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { gradingPeriods, schoolYears, scores } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit, emit } from "@/lib/audit";
import { processEvents } from "@/lib/events";
import { PASSING_SCORE } from "@/modules/grades/queries";

type Result = { ok?: string; error?: string; issues?: string[] } | null;

export async function addGradingPeriod(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("grades.manage_periods");
  const name = String(form.get("name") ?? "").trim();
  const sequence = Number(form.get("sequence") ?? 0);
  const startsOn = String(form.get("startsOn") ?? "");
  const endsOn = String(form.get("endsOn") ?? "");
  if (!name || !sequence || !startsOn || !endsOn)
    return { error: "A period needs a name, an order, a start and an end." };
  if (endsOn <= startsOn) return { error: "The period has to end after it starts." };

  return withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    if (!year) return { error: "Set the current school year first, in Setup." };

    await tx
      .insert(gradingPeriods)
      .values({ schoolId: school.id, schoolYearId: year.id, name, sequence, startsOn, endsOn })
      .onConflictDoUpdate({
        target: [gradingPeriods.schoolYearId, gradingPeriods.sequence],
        set: { name, startsOn, endsOn },
      });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "grading_period.saved",
      after: { name, sequence },
    });
    revalidatePath("/grades");
    return { ok: `${name} saved.` };
  });
}

/**
 * Saves a whole class at once. A blank box means "not graded yet" and clears
 * any score that was there, so a mistake is undone the same way it was made.
 */
export async function saveClassScores(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("grades.enter");
  const subjectId = String(form.get("subjectId") ?? "");
  const gradingPeriodId = String(form.get("gradingPeriodId") ?? "");
  if (!subjectId || !gradingPeriodId) return { error: "Pick a class and a period." };

  const issues: string[] = [];
  const entries: { studentId: string; score: number | null }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("score:")) continue;
    const studentId = key.slice(6);
    const raw = String(value).trim();
    if (raw === "") {
      entries.push({ studentId, score: null });
      continue;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      issues.push(`“${raw}” is not a score between 0 and 100.`);
      continue;
    }
    entries.push({ studentId, score: n });
  }
  if (issues.length) return { error: "Nothing was saved.", issues: issues.slice(0, 10) };

  const result = await withTenant(school.id, async (tx) => {
    const [period] = await tx
      .select()
      .from(gradingPeriods)
      .where(
        and(eq(gradingPeriods.schoolId, school.id), eq(gradingPeriods.id, gradingPeriodId)),
      )
      .limit(1);
    if (!period) return { error: "That grading period is not this school's." };
    if (period.closedAt)
      return { error: `${period.name} is closed. Reopen it before changing a score.` };

    let saved = 0;
    for (const e of entries) {
      if (e.score === null) {
        await tx
          .delete(scores)
          .where(
            and(
              eq(scores.schoolId, school.id),
              eq(scores.gradingPeriodId, gradingPeriodId),
              eq(scores.subjectId, subjectId),
              eq(scores.studentId, e.studentId),
            ),
          );
        continue;
      }
      await tx
        .insert(scores)
        .values({
          schoolId: school.id,
          gradingPeriodId,
          studentId: e.studentId,
          subjectId,
          score: e.score,
          enteredByUserId: session.userId,
        })
        .onConflictDoUpdate({
          target: [scores.gradingPeriodId, scores.studentId, scores.subjectId],
          set: { score: e.score, enteredByUserId: session.userId, updatedAt: new Date() },
        });
      saved += 1;

      // Guidance listens for this, if it is on.
      if (e.score < PASSING_SCORE) {
        await emit(tx, school.id, "student.failing", {
          studentId: e.studentId,
          subjectId,
          score: e.score,
          period: period.name,
        });
      }
    }

    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "scores.saved",
      entity: "subjects",
      entityId: subjectId,
      after: { period: period.name, saved },
    });
    return { ok: `${saved} ${saved === 1 ? "score" : "scores"} saved for ${period.name}.` };
  });

  await processEvents(school.id);
  revalidatePath("/grades");
  return result;
}

/** Closing a period freezes it and tells the Portal the card is ready. */
export async function closeGradingPeriod(form: FormData) {
  const { school, session } = await requirePermission("grades.manage_periods");
  const id = String(form.get("gradingPeriodId") ?? "");
  const reopen = form.get("reopen") === "1";
  if (!id) return;

  await withTenant(school.id, async (tx) => {
    const [period] = await tx
      .select()
      .from(gradingPeriods)
      .where(and(eq(gradingPeriods.schoolId, school.id), eq(gradingPeriods.id, id)))
      .limit(1);
    if (!period) return;

    await tx
      .update(gradingPeriods)
      .set({ closedAt: reopen ? null : new Date() })
      .where(eq(gradingPeriods.id, id));

    if (!reopen) {
      await emit(tx, school.id, "grade.period_closed", {
        gradingPeriodId: id,
        name: period.name,
      });
    }
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: reopen ? "grading_period.reopened" : "grading_period.closed",
      entity: "grading_periods",
      entityId: id,
      after: { name: period.name },
    });
  });

  await processEvents(school.id);
  revalidatePath("/grades");
}
