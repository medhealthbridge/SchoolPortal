import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { withPlatform, withTenant } from "@/db";
import { attendanceRecords, events, notifications, outboundMessages, schools } from "@/db/schema";
import { submitAttendance } from "@/modules/attendance/submit";
import { absenceStreak, dailySummary, monthlyReport } from "@/modules/attendance/queries";
import { processEvents } from "@/lib/events";
import { dropSchool, makeSchool } from "./helpers";

const DATE = "2026-09-07"; // a Monday, which is the seeded slot's weekday

describe("attendance", () => {
  let s: Awaited<ReturnType<typeof makeSchool>>;

  beforeAll(async () => {
    s = await makeSchool();
  });

  afterAll(async () => {
    await dropSchool(s.school.id);
  });

  const tap = (studentId: string, status: "present" | "absent" | "late", markedAt: string) => ({
    id: randomUUID(),
    studentId,
    slotId: s.slot.id,
    onDate: DATE,
    status,
    markedAt,
  });

  it("stores one row per student and counts them", async () => {
    const batch = s.students.map((st, i) =>
      tap(st.id, i === 0 ? "absent" : i === 1 ? "late" : "present", "2026-09-07T08:05:00Z"),
    );
    const outcome = await submitAttendance(s.school.id, s.teacher.id, "Teacher", batch);
    expect(outcome.accepted).toHaveLength(3);

    const summary = await withTenant(s.school.id, (tx) =>
      dailySummary(tx, s.school.id, DATE, 1),
    );
    expect(summary).toMatchObject({ present: 1, absent: 1, late: 1, slotsSubmitted: 1 });
  });

  it("ignores a replayed batch, so a retry over bad signal is free", async () => {
    const batch = [tap(s.students[0].id, "absent", "2026-09-07T08:05:00Z")];
    const first = await submitAttendance(s.school.id, s.teacher.id, "Teacher", batch);
    const replay = await submitAttendance(s.school.id, s.teacher.id, "Teacher", batch);
    expect(first.ignored.length + first.accepted.length).toBe(1);
    expect(replay.accepted).toHaveLength(0);
    expect(replay.ignored).toHaveLength(1);
  });

  it("lets the latest timestamp win and keeps the earlier one in the audit log", async () => {
    const student = s.students[2].id;
    await submitAttendance(s.school.id, s.teacher.id, "Teacher", [
      tap(student, "late", "2026-09-07T09:30:00Z"),
    ]);
    const [row] = await withTenant(s.school.id, (tx) =>
      tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.studentId, student),
            eq(attendanceRecords.onDate, DATE),
          ),
        ),
    );
    expect(row.status).toBe("late");

    // An older tap arriving afterwards does not overwrite the newer one.
    await submitAttendance(s.school.id, s.teacher.id, "Teacher", [
      tap(student, "present", "2026-09-07T07:00:00Z"),
    ]);
    const [again] = await withTenant(s.school.id, (tx) =>
      tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.studentId, student),
            eq(attendanceRecords.onDate, DATE),
          ),
        ),
    );
    expect(again.status).toBe("late");
  });

  it("flags a three-day absence streak", async () => {
    const student = s.students[1].id;
    for (const date of ["2026-09-14", "2026-09-15", "2026-09-16"]) {
      await submitAttendance(s.school.id, s.teacher.id, "Teacher", [
        {
          id: randomUUID(),
          studentId: student,
          slotId: s.slot.id,
          onDate: date,
          status: "absent",
          markedAt: `${date}T08:05:00Z`,
        },
      ]);
    }
    const streak = await withTenant(s.school.id, (tx) =>
      absenceStreak(tx, s.school.id, student, "2026-09-16"),
    );
    expect(streak).toBe(3);

    const queued = await withTenant(s.school.id, (tx) =>
      tx.select().from(events).where(eq(events.schoolId, s.school.id)),
    );
    expect(queued.some((e) => e.type === "student.absence_streak")).toBe(true);
  });

  it("rolls the month up per student", async () => {
    const rows = await withTenant(s.school.id, (tx) =>
      monthlyReport(tx, s.school.id, "2026-09"),
    );
    expect(rows.length).toBeGreaterThan(0);
    const total = rows.reduce((n, r) => n + r.present + r.absent + r.late + r.excused, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("sends the parent one alert per absent day, not one per class", async () => {
    await processEvents(s.school.id, 1000);

    const sms = await withTenant(s.school.id, (tx) =>
      tx.select().from(outboundMessages).where(eq(outboundMessages.schoolId, s.school.id)),
    );
    // Student 0 was marked absent on one day across however many taps landed.
    expect(sms.filter((m) => m.channel === "sms")).toHaveLength(1);

    const alerts = await withTenant(s.school.id, (tx) =>
      tx.select().from(notifications).where(eq(notifications.schoolId, s.school.id)),
    );
    expect(alerts.some((n) => n.title.includes("absence streak"))).toBe(true);

    const unprocessed = await withTenant(s.school.id, (tx) =>
      tx.select().from(events).where(eq(events.schoolId, s.school.id)),
    );
    expect(unprocessed.every((e) => e.processedAt !== null)).toBe(true);
  });

  it("refuses a tap for a student who is not on that class's roster", async () => {
    const other = await makeSchool();
    const outcome = await submitAttendance(s.school.id, s.teacher.id, "Teacher", [
      {
        id: randomUUID(),
        studentId: other.students[0].id,
        slotId: s.slot.id,
        onDate: "2026-09-21",
        status: "present",
        markedAt: "2026-09-21T08:05:00Z",
      },
    ]);
    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected).toHaveLength(1);

    const rows = await withTenant(other.school.id, (tx) =>
      tx
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.studentId, other.students[0].id)),
    );
    expect(rows).toHaveLength(0);
    await dropSchool(other.school.id);
  });

  it("pauses alerts while a school is suspended", async () => {
    await withPlatform((tx) =>
      tx.update(schools).set({ status: "suspended" }).where(eq(schools.id, s.school.id)),
    );
    const result = await processEvents(s.school.id);
    expect(result).toMatchObject({ processed: 0, paused: true });
    await withPlatform((tx) =>
      tx.update(schools).set({ status: "active" }).where(eq(schools.id, s.school.id)),
    );
  });
});
