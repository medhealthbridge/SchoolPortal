"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  activities,
  clubMemberships,
  clubs,
  enrollments,
  serviceHours,
  students,
} from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit, emit } from "@/lib/audit";
import { processEvents } from "@/lib/events";
import type { Permission } from "@/lib/roles";

type Result = { ok?: string; error?: string; issues?: string[] } | null;

/**
 * SAO events and the chaplain's ministry activities are the same record with
 * a different `kind`, so they share these actions and differ only in which
 * permission opens them.
 */
function permissionFor(kind: "sao_event" | "ministry"): Permission {
  return kind === "ministry" ? "chaplain.manage" : "sao.manage";
}

function pathFor(kind: "sao_event" | "ministry") {
  return kind === "ministry" ? "/chaplain" : "/sao";
}

export async function createActivity(_prev: Result, form: FormData): Promise<Result> {
  const kind = String(form.get("kind") ?? "sao_event") as "sao_event" | "ministry";
  const { school, session } = await requirePermission(permissionFor(kind));
  const name = String(form.get("name") ?? "").trim();
  const onDate = String(form.get("onDate") ?? "");
  const location = String(form.get("location") ?? "").trim() || null;
  const hours = Number(form.get("serviceHours") ?? 0);
  if (!name || !onDate) return { error: "An activity needs a name and a date." };
  if (!Number.isInteger(hours) || hours < 0 || hours > 24)
    return { error: "Service hours must be a whole number from 0 to 24." };

  await withTenant(school.id, async (tx) => {
    const [row] = await tx
      .insert(activities)
      .values({
        schoolId: school.id,
        kind,
        name,
        onDate,
        location,
        serviceHours: hours,
        organizedByUserId: session.userId,
      })
      .returning();
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "activity.created",
      entity: "activities",
      entityId: row.id,
      after: { kind, name, onDate, hours },
    });
  });

  revalidatePath(pathFor(kind));
  return { ok: `${name} added.` };
}

/**
 * Credits a whole section at once — how a school actually records a mass or a
 * clean-up drive. The report card reads these hours when Grades is on.
 */
export async function creditSection(_prev: Result, form: FormData): Promise<Result> {
  const kind = String(form.get("kind") ?? "sao_event") as "sao_event" | "ministry";
  const { school, session } = await requirePermission(permissionFor(kind));
  const activityId = String(form.get("activityId") ?? "");
  const sectionId = String(form.get("sectionId") ?? "");
  if (!activityId || !sectionId) return { error: "Pick an activity and a section." };

  const result = await withTenant(school.id, async (tx) => {
    const [activity] = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.schoolId, school.id), eq(activities.id, activityId)))
      .limit(1);
    if (!activity) return { error: "That activity is not this school's." };

    const roster = await tx
      .select({ studentId: enrollments.studentId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.schoolId, school.id),
          eq(enrollments.sectionId, sectionId),
          eq(enrollments.status, "active"),
        ),
      );
    if (roster.length === 0) return { error: "Nobody is enrolled in that section." };

    let credited = 0;
    for (const r of roster) {
      const [row] = await tx
        .insert(serviceHours)
        .values({
          schoolId: school.id,
          studentId: r.studentId,
          activityId,
          hours: activity.serviceHours,
        })
        .onConflictDoNothing()
        .returning();
      if (row) credited += 1;
    }

    if (credited > 0 && activity.serviceHours > 0) {
      await emit(tx, school.id, "sao.service_hours_logged", {
        activityId,
        students: credited,
        hours: activity.serviceHours,
      });
    }
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "service_hours.credited",
      entity: "activities",
      entityId: activityId,
      after: { credited, hours: activity.serviceHours },
    });
    return {
      ok:
        credited === 0
          ? "That section was already credited for this activity."
          : `${credited} students credited with ${activity.serviceHours} hours each.`,
    };
  });

  await processEvents(school.id);
  revalidatePath(pathFor(kind));
  return result;
}

export async function createClub(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("sao.manage");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "A club needs a name." };

  await withTenant(school.id, async (tx) => {
    await tx
      .insert(clubs)
      .values({ schoolId: school.id, name, moderatorUserId: session.userId })
      .onConflictDoNothing();
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "club.created",
      after: { name },
    });
  });
  revalidatePath("/sao");
  return { ok: `${name} added.` };
}

export async function addClubMembers(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("sao.manage");
  const clubId = String(form.get("clubId") ?? "");
  const numbers = String(form.get("studentNumbers") ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!clubId || numbers.length === 0)
    return { error: "Pick a club and list at least one student ID." };

  const result = await withTenant(school.id, async (tx) => {
    const found = await tx
      .select()
      .from(students)
      .where(
        and(eq(students.schoolId, school.id), inArray(students.studentNumber, numbers)),
      );
    const missing = numbers.filter(
      (n) => !found.some((f) => f.studentNumber === n),
    );
    if (missing.length)
      return { error: "Nothing was saved.", issues: missing.map((m) => `No student with ID ${m}.`) };

    let added = 0;
    for (const s of found) {
      const [row] = await tx
        .insert(clubMemberships)
        .values({ schoolId: school.id, clubId, studentId: s.id })
        .onConflictDoNothing()
        .returning();
      if (row) added += 1;
    }
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "club.members_added",
      entity: "clubs",
      entityId: clubId,
      after: { added },
    });
    return { ok: `${added} added, ${found.length - added} already members.` };
  });

  revalidatePath("/sao");
  return result;
}
