import { and, count, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { attendanceRecords, enrollments, timetableSlots } from "@/db/schema";
import { audit, emit } from "@/lib/audit";
import { absenceStreak } from "./queries";

export type IncomingRecord = {
  /** Generated on the phone. Retries carry the same id, so they never duplicate. */
  id: string;
  studentId: string;
  slotId: string;
  onDate: string;
  status: "present" | "absent" | "late" | "excused";
  note?: string | null;
  /** The phone's clock at the moment of the tap. */
  markedAt: string;
};

export type SubmitOutcome = {
  accepted: string[];
  ignored: string[];
  superseded: string[];
  /** Taps for a class or a student this school does not have. */
  rejected: string[];
};

const ABSENCE_STREAK_FLAG = 3;

/**
 * Takes a batch of taps from one teacher, offline or not.
 *
 * - An id the server already has is ignored, so a retry is free.
 * - If two people marked the same student in the same class on the same day,
 *   the later `markedAt` wins; the earlier row stays in the audit log.
 */
export async function submitAttendance(
  schoolId: string,
  teacherUserId: string,
  teacherName: string,
  records: IncomingRecord[],
): Promise<SubmitOutcome> {
  const outcome: SubmitOutcome = {
    accepted: [],
    ignored: [],
    superseded: [],
    rejected: [],
  };
  if (records.length === 0) return outcome;

  await withTenant(schoolId, async (tx) => {
    // Row-level security stops this school writing another school's rows, but
    // a foreign student id in an otherwise well-formed tap would still attach
    // to a row this school owns: the foreign-key check runs below RLS. So the
    // roster of each slot is the gate, and it also catches a student who has
    // been moved out of the section.
    const rosterBySlot = new Map<string, Set<string>>();
    for (const slotId of new Set(records.map((r) => r.slotId))) {
      const [slot] = await tx
        .select({ sectionId: timetableSlots.sectionId })
        .from(timetableSlots)
        .where(and(eq(timetableSlots.schoolId, schoolId), eq(timetableSlots.id, slotId)))
        .limit(1);
      if (!slot) {
        rosterBySlot.set(slotId, new Set());
        continue;
      }
      const enrolled = await tx
        .select({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.schoolId, schoolId),
            eq(enrollments.sectionId, slot.sectionId),
            eq(enrollments.status, "active"),
          ),
        );
      rosterBySlot.set(slotId, new Set(enrolled.map((e) => e.studentId)));
    }

    for (const rec of records) {
      if (!rosterBySlot.get(rec.slotId)?.has(rec.studentId)) {
        outcome.rejected.push(rec.id);
        continue;
      }
      const markedAt = new Date(rec.markedAt);

      const [sameId] = await tx
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(eq(attendanceRecords.id, rec.id))
        .limit(1);
      if (sameId) {
        outcome.ignored.push(rec.id);
        continue;
      }

      const [existing] = await tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.schoolId, schoolId),
            eq(attendanceRecords.slotId, rec.slotId),
            eq(attendanceRecords.studentId, rec.studentId),
            eq(attendanceRecords.onDate, rec.onDate),
          ),
        )
        .limit(1);

      if (existing) {
        if (existing.markedAt >= markedAt) {
          outcome.ignored.push(rec.id);
          continue;
        }
        await audit(tx, {
          schoolId,
          actorUserId: teacherUserId,
          actorLabel: teacherName,
          action: "attendance.superseded",
          entity: "attendance_records",
          entityId: existing.id,
          before: { status: existing.status, markedAt: existing.markedAt },
          after: { status: rec.status, markedAt },
        });
        await tx
          .delete(attendanceRecords)
          .where(eq(attendanceRecords.id, existing.id));
        outcome.superseded.push(existing.id);
      }

      await tx.insert(attendanceRecords).values({
        id: rec.id,
        schoolId,
        studentId: rec.studentId,
        slotId: rec.slotId,
        onDate: rec.onDate,
        status: rec.status,
        note: rec.note ?? null,
        markedByUserId: teacherUserId,
        markedAt,
      });
      outcome.accepted.push(rec.id);

      await audit(tx, {
        schoolId,
        actorUserId: teacherUserId,
        actorLabel: teacherName,
        action: "attendance.marked",
        entity: "attendance_records",
        entityId: rec.id,
        after: { status: rec.status, studentId: rec.studentId, onDate: rec.onDate },
      });

      // Modules reach each other only through events. Nothing here knows
      // whether Discipline, Guidance or the Portal is switched on.
      if (rec.status === "late") {
        await emit(tx, schoolId, "student.marked_late", {
          studentId: rec.studentId,
          slotId: rec.slotId,
          onDate: rec.onDate,
        });
      }
      if (rec.status === "absent") {
        // One alert per student per day, not one per class period.
        const [{ n: absencesToday } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.schoolId, schoolId),
              eq(attendanceRecords.studentId, rec.studentId),
              eq(attendanceRecords.onDate, rec.onDate),
              eq(attendanceRecords.status, "absent"),
            ),
          );
        if (Number(absencesToday) <= 1) {
          await emit(tx, schoolId, "student.marked_absent", {
            studentId: rec.studentId,
            slotId: rec.slotId,
            onDate: rec.onDate,
          });
        }
        const streak = await absenceStreak(tx, schoolId, rec.studentId, rec.onDate);
        if (streak >= ABSENCE_STREAK_FLAG) {
          await emit(tx, schoolId, "student.absence_streak", {
            studentId: rec.studentId,
            days: streak,
            onDate: rec.onDate,
          });
        }
      }
    }
  });

  return outcome;
}

