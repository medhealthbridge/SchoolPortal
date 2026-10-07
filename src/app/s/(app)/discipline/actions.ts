"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { incidents, offenseLevels, sanctions, students } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit, emit } from "@/lib/audit";
import { processEvents } from "@/lib/events";

type Result = { ok?: string; error?: string } | null;

/** Three incidents in a school year is a pattern, not an accident. */
const REPEAT_AT = 3;

export async function addOffenseLevel(_prev: Result, form: FormData): Promise<Result> {
  const { school } = await requirePermission("discipline.manage");
  const name = String(form.get("name") ?? "").trim();
  const severity = String(form.get("severity") ?? "minor") as "minor" | "major" | "grave";
  const description = String(form.get("description") ?? "").trim() || null;
  if (!name) return { error: "An offence needs a name." };

  await withTenant(school.id, (tx) =>
    tx
      .insert(offenseLevels)
      .values({ schoolId: school.id, name, severity, description })
      .onConflictDoUpdate({
        target: [offenseLevels.schoolId, offenseLevels.name],
        set: { severity, description },
      }),
  );
  revalidatePath("/discipline");
  return { ok: `${name} saved.` };
}

export async function reportIncident(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("discipline.report");
  const studentNumber = String(form.get("studentNumber") ?? "").trim();
  const offenseLevelId = String(form.get("offenseLevelId") ?? "") || null;
  const onDate = String(form.get("onDate") ?? "");
  const summary = String(form.get("summary") ?? "").trim();
  if (!studentNumber || !onDate || !summary)
    return { error: "A report needs a student ID, a date and what happened." };

  const result = await withTenant(school.id, async (tx) => {
    const [student] = await tx
      .select()
      .from(students)
      .where(
        and(eq(students.schoolId, school.id), eq(students.studentNumber, studentNumber)),
      )
      .limit(1);
    if (!student) return { error: `No student here has the ID ${studentNumber}.` };

    const [row] = await tx
      .insert(incidents)
      .values({
        schoolId: school.id,
        studentId: student.id,
        offenseLevelId,
        onDate,
        summary,
        reportedByUserId: session.userId,
      })
      .returning();

    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "incident.reported",
      entity: "incidents",
      entityId: row.id,
      after: { studentNumber, onDate },
    });

    // A third incident this year is referred to Guidance, if it is on.
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(incidents)
      .where(
        and(eq(incidents.schoolId, school.id), eq(incidents.studentId, student.id)),
      );
    if (Number(n) >= REPEAT_AT) {
      await emit(tx, school.id, "discipline.repeat_case", {
        studentId: student.id,
        incidents: Number(n),
      });
    }
    return {
      ok: `Logged for ${student.firstName} ${student.lastName}.${
        Number(n) >= REPEAT_AT ? " That is their third, so Guidance has been told." : ""
      }`,
    };
  });

  await processEvents(school.id);
  revalidatePath("/discipline");
  return result;
}

/**
 * Issuing a suspension tells Attendance, which marks those days excused
 * rather than absent — the student is not truant, they are suspended.
 */
export async function issueSanction(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("discipline.manage");
  const incidentId = String(form.get("incidentId") ?? "");
  const kind = String(form.get("kind") ?? "warning") as
    | "warning"
    | "community_service"
    | "detention"
    | "suspension"
    | "referral";
  const startsOn = String(form.get("startsOn") ?? "");
  const endsOn = String(form.get("endsOn") ?? "") || null;
  const note = String(form.get("note") ?? "").trim() || null;
  if (!incidentId || !startsOn) return { error: "Pick an incident and a start date." };
  if (endsOn && endsOn < startsOn) return { error: "A sanction cannot end before it starts." };

  const result = await withTenant(school.id, async (tx) => {
    const [incident] = await tx
      .select()
      .from(incidents)
      .where(and(eq(incidents.schoolId, school.id), eq(incidents.id, incidentId)))
      .limit(1);
    if (!incident) return { error: "That incident is not this school's." };

    await tx.insert(sanctions).values({
      schoolId: school.id,
      incidentId,
      kind,
      startsOn,
      endsOn,
      note,
      issuedByUserId: session.userId,
    });
    await tx
      .update(incidents)
      .set({ status: "resolved" })
      .where(eq(incidents.id, incidentId));

    if (kind === "suspension") {
      await emit(tx, school.id, "discipline.suspension_started", {
        studentId: incident.studentId,
        startsOn,
        endsOn: endsOn ?? startsOn,
      });
    }
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "sanction.issued",
      entity: "incidents",
      entityId: incidentId,
      after: { kind, startsOn, endsOn },
    });
    return {
      ok:
        kind === "suspension"
          ? "Suspension recorded. Those school days are marked excused in Attendance."
          : "Sanction recorded.",
    };
  });

  await processEvents(school.id);
  revalidatePath("/discipline");
  return result;
}
