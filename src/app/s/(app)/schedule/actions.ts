"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { withTenant, type Tx } from "@/db";
import {
  attendanceRecords,
  rooms,
  sections,
  subjects,
  timetableSlots,
  userRoles,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { clashesFor, currentYear, normaliseTime, prettyClash } from "@/lib/schedule";

type ActionResult = { ok?: string; error?: string; issues?: string[] } | null;

/** A teacher who may be put on the schedule: active, holding a teaching role. */
async function teacherOk(tx: Tx, schoolId: string, userId: string) {
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(users.schoolId, schoolId),
        eq(users.id, userId),
        eq(users.status, "active"),
        inArray(userRoles.role, ["teacher", "adviser"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function hasMarks(tx: Tx, slotId: string) {
  const [r] = await tx
    .select({ n: count() })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.slotId, slotId));
  return Number(r?.n ?? 0) > 0;
}

/**
 * Adds a class on one or more days, or changes one. All or nothing: if any day
 * clashes, nothing is saved and every clash is listed.
 */
export async function saveClass(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("timetable.manage");
  const id = String(form.get("id") ?? "") || null;
  const sectionId = String(form.get("sectionId") ?? "");
  const subjectId = String(form.get("subjectId") ?? "");
  const teacherUserId = String(form.get("teacherUserId") ?? "");
  const roomId = String(form.get("roomId") ?? "") || null;
  const days = form
    .getAll("weekday")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const startsAt = normaliseTime(String(form.get("startsAt") ?? ""));
  const endsAt = normaliseTime(String(form.get("endsAt") ?? ""));

  if (!sectionId || !subjectId || !teacherUserId)
    return { error: "Choose the subject and the teacher." };
  if (days.length === 0) return { error: "Tick at least one day." };
  if (id && days.length > 1) return { error: "A class being changed is on one day. Tick one." };
  if (!startsAt || !endsAt) return { error: "Enter a start and an end time." };
  if (endsAt <= startsAt) return { error: "The class has to end after it starts." };

  const result = await withTenant(school.id, async (tx): Promise<ActionResult> => {
    const year = await currentYear(tx, school.id);
    if (!year) return { error: "Set the current school year in Setup first." };

    const [section] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.id, sectionId)))
      .limit(1);
    const [subject] = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.schoolId, school.id), eq(subjects.id, subjectId)))
      .limit(1);
    if (!section || !subject) return { error: "That section or subject is not on file." };
    if (!(await teacherOk(tx, school.id, teacherUserId)))
      return { error: "Choose an active teacher. Add teachers on the Teachers page." };
    if (roomId) {
      const [room] = await tx
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.schoolId, school.id), eq(rooms.id, roomId)))
        .limit(1);
      if (!room) return { error: "That room is not on file." };
    }

    let existing: typeof timetableSlots.$inferSelect | undefined;
    if (id) {
      [existing] = await tx
        .select()
        .from(timetableSlots)
        .where(
          and(
            eq(timetableSlots.schoolId, school.id),
            eq(timetableSlots.id, id),
            isNull(timetableSlots.retiredAt),
          ),
        )
        .limit(1);
      if (!existing) return { error: "That class is no longer on the schedule." };
    }

    const issues: string[] = [];
    for (const weekday of days) {
      const found = await clashesFor(
        tx,
        school.id,
        { schoolYearId: year.id, weekday, startsAt, endsAt, teacherUserId, sectionId, roomId },
        id ?? undefined,
      );
      issues.push(...found.map((f) => prettyClash(weekday, f)));
    }
    if (issues.length > 0) return { error: "Nothing was saved. It clashes with:", issues };

    const values = {
      schoolId: school.id,
      schoolYearId: year.id,
      teacherUserId,
      subjectId,
      sectionId,
      roomId,
      startsAt,
      endsAt,
    };

    if (existing) {
      const weekday = days[0]!;
      // Marks already taken belong to the class as it was. Changing it in place
      // would rewrite whose class they were, so a class with marks is retired
      // and a new one takes its place.
      if (await hasMarks(tx, existing.id)) {
        await tx
          .update(timetableSlots)
          .set({ retiredAt: new Date() })
          .where(eq(timetableSlots.id, existing.id));
        await tx.insert(timetableSlots).values({ ...values, weekday });
      } else {
        await tx
          .update(timetableSlots)
          .set({ ...values, weekday })
          .where(eq(timetableSlots.id, existing.id));
      }
      await audit(tx, {
        schoolId: school.id,
        actorUserId: session.userId,
        actorLabel: session.name,
        action: "timetable.slot_changed",
        entity: "timetable_slots",
        entityId: existing.id,
        before: { weekday: existing.weekday, startsAt: existing.startsAt, teacher: existing.teacherUserId },
        after: { weekday, startsAt, teacher: teacherUserId },
      });
      return { ok: `${subject.name} changed.` };
    }

    for (const weekday of days) await tx.insert(timetableSlots).values({ ...values, weekday });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "timetable.slot_added",
      entity: "sections",
      entityId: sectionId,
      after: { subject: subject.name, days, startsAt, endsAt, teacher: teacherUserId },
    });
    return {
      ok: `${subject.name} added on ${days.length} ${days.length === 1 ? "day" : "days"}.`,
    };
  });

  revalidatePath("/schedule");
  return result;
}

/** Takes a class off the schedule. One with marks is retired so they survive. */
export async function removeClass(form: FormData) {
  const { school, session } = await requirePermission("timetable.manage");
  const id = String(form.get("id") ?? "");
  await withTenant(school.id, async (tx) => {
    const [slot] = await tx
      .select()
      .from(timetableSlots)
      .where(and(eq(timetableSlots.schoolId, school.id), eq(timetableSlots.id, id)))
      .limit(1);
    if (!slot || slot.retiredAt) return;
    if (await hasMarks(tx, id))
      await tx.update(timetableSlots).set({ retiredAt: new Date() }).where(eq(timetableSlots.id, id));
    else await tx.delete(timetableSlots).where(eq(timetableSlots.id, id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "timetable.slot_removed",
      entity: "timetable_slots",
      entityId: id,
    });
  });
  revalidatePath("/schedule");
}

/**
 * Names a section's adviser. The adviser role comes with it, because advising
 * is what lets them see the whole section's attendance and grades.
 */
export async function setAdviser(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("timetable.manage");
  const sectionId = String(form.get("sectionId") ?? "");
  const adviserUserId = String(form.get("adviserUserId") ?? "") || null;

  const result = await withTenant(school.id, async (tx): Promise<ActionResult> => {
    const [section] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.id, sectionId)))
      .limit(1);
    if (!section) return { error: "That section is not on file." };
    if (adviserUserId && !(await teacherOk(tx, school.id, adviserUserId)))
      return { error: "Choose an active teacher." };

    await tx.update(sections).set({ adviserUserId }).where(eq(sections.id, sectionId));
    if (adviserUserId) {
      const held = await tx
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, adviserUserId));
      if (!held.some((r) => r.role === "adviser"))
        await tx
          .insert(userRoles)
          .values({ schoolId: school.id, userId: adviserUserId, role: "adviser" });
    }
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "section.adviser_set",
      entity: "sections",
      entityId: sectionId,
      before: { adviser: section.adviserUserId },
      after: { adviser: adviserUserId },
    });
    return { ok: adviserUserId ? "Adviser saved." : "Adviser removed." };
  });

  revalidatePath("/schedule");
  return result;
}
