import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  attendanceRecords,
  feeItems,
  gradingPeriods,
  guidanceCases,
  incidents,
  registrarRequests,
  sanctions,
  scores,
  studentCharges,
  studentPayments,
} from "@/db/schema";
import { reportCard, PASSING_SCORE } from "@/modules/grades/queries";
import { balanceFor, studentsOwing } from "@/modules/billing/queries";
import { clearanceFor } from "@/modules/registrar/clearance";
import { enabledModules } from "@/lib/tenant";
import { processEvents } from "@/lib/events";
import { emit } from "@/lib/audit";
import { dropSchool, makeSchool } from "./helpers";

describe("grades", () => {
  let s: Awaited<ReturnType<typeof makeSchool>>;
  let periodIds: string[] = [];

  beforeAll(async () => {
    s = await makeSchool();
    periodIds = await withTenant(s.school.id, async (tx) => {
      const ids: string[] = [];
      for (const [i, name] of ["First", "Second"].entries()) {
        const [row] = await tx
          .insert(gradingPeriods)
          .values({
            schoolId: s.school.id,
            schoolYearId: s.year.id,
            name,
            sequence: i + 1,
            startsOn: `2026-0${6 + i * 2}-01`,
            endsOn: `2026-0${7 + i * 2}-28`,
          })
          .returning();
        ids.push(row.id);
      }
      return ids;
    });
  });

  afterAll(async () => {
    await dropSchool(s.school.id);
  });

  it("averages a subject across the periods entered, ignoring the blanks", async () => {
    await withTenant(s.school.id, async (tx) => {
      await tx.insert(scores).values([
        {
          schoolId: s.school.id,
          gradingPeriodId: periodIds[0],
          studentId: s.students[0].id,
          subjectId: s.subject.id,
          score: 80,
        },
        {
          schoolId: s.school.id,
          gradingPeriodId: periodIds[1],
          studentId: s.students[0].id,
          subjectId: s.subject.id,
          score: 90,
        },
      ]);
    });

    const card = await withTenant(s.school.id, (tx) =>
      reportCard(tx, s.school.id, s.students[0].id, s.year.id, {
        attendance: false,
        serviceHours: false,
      }),
    );
    expect(card?.lines[0].byPeriod).toEqual([80, 90]);
    expect(card?.lines[0].average).toBe(85);
    expect(card?.general).toBe(85);
  });

  it("leaves a student with no scores out of the general average", async () => {
    const card = await withTenant(s.school.id, (tx) =>
      reportCard(tx, s.school.id, s.students[1].id, s.year.id, {
        attendance: false,
        serviceHours: false,
      }),
    );
    expect(card?.lines).toHaveLength(0);
    expect(card?.general).toBeNull();
  });

  it("prints attendance on the card only when that module is asked for", async () => {
    const withIt = await withTenant(s.school.id, (tx) =>
      reportCard(tx, s.school.id, s.students[0].id, s.year.id, {
        attendance: true,
        serviceHours: false,
      }),
    );
    const without = await withTenant(s.school.id, (tx) =>
      reportCard(tx, s.school.id, s.students[0].id, s.year.id, {
        attendance: false,
        serviceHours: false,
      }),
    );
    expect(withIt?.attendance).not.toBeNull();
    expect(without?.attendance).toBeNull();
  });

  it("counts 74 as failing and 75 as a pass", () => {
    expect(PASSING_SCORE).toBe(75);
    expect(74 < PASSING_SCORE).toBe(true);
    expect(75 < PASSING_SCORE).toBe(false);
  });
});

describe("school fees and clearance", () => {
  let s: Awaited<ReturnType<typeof makeSchool>>;
  let feeId: string;

  beforeAll(async () => {
    s = await makeSchool();
    feeId = await withTenant(s.school.id, async (tx) => {
      const [fee] = await tx
        .insert(feeItems)
        .values({
          schoolId: s.school.id,
          schoolYearId: s.year.id,
          name: "Tuition",
          amountCentavos: 500_000,
        })
        .returning();
      await tx.insert(studentCharges).values({
        schoolId: s.school.id,
        studentId: s.students[0].id,
        feeItemId: fee.id,
        amountCentavos: fee.amountCentavos,
        chargedOn: "2026-06-15",
      });
      return fee.id;
    });
  });

  afterAll(async () => {
    await dropSchool(s.school.id);
  });

  it("owes the charge until it is paid", async () => {
    const before = await withTenant(s.school.id, (tx) =>
      balanceFor(tx, s.school.id, s.students[0].id),
    );
    expect(before.balanceCentavos).toBe(500_000);

    await withTenant(s.school.id, (tx) =>
      tx.insert(studentPayments).values({
        schoolId: s.school.id,
        studentId: s.students[0].id,
        amountCentavos: 200_000,
        receiptNo: "OR-1",
        paidOn: "2026-07-01",
      }),
    );
    const after = await withTenant(s.school.id, (tx) =>
      balanceFor(tx, s.school.id, s.students[0].id),
    );
    expect(after.balanceCentavos).toBe(300_000);
  });

  it("lists only the students who still owe", async () => {
    const owing = await withTenant(s.school.id, (tx) => studentsOwing(tx, s.school.id));
    expect(owing.map((o) => o.studentId)).toEqual([s.students[0].id]);
  });

  it("holds clearance while a balance stands, and clears it once paid", async () => {
    const on = await enabledModules(s.school.id);

    const held = await withTenant(s.school.id, (tx) =>
      clearanceFor(tx, s.school.id, s.students[0].id, on),
    );
    expect(held.cleared).toBe(false);
    expect(held.reasons[0]).toMatch(/owing/);

    await withTenant(s.school.id, (tx) =>
      tx.insert(studentPayments).values({
        schoolId: s.school.id,
        studentId: s.students[0].id,
        amountCentavos: 300_000,
        receiptNo: "OR-2",
        paidOn: "2026-07-02",
      }),
    );
    const cleared = await withTenant(s.school.id, (tx) =>
      clearanceFor(tx, s.school.id, s.students[0].id, on),
    );
    expect(cleared.cleared).toBe(true);
  });

  it("says what it checked, so an empty answer is not mistaken for a clean one", async () => {
    const nothingOn = new Set<never>() as unknown as Awaited<
      ReturnType<typeof enabledModules>
    >;
    const result = await withTenant(s.school.id, (tx) =>
      clearanceFor(tx, s.school.id, s.students[0].id, nothingOn),
    );
    expect(result.cleared).toBe(true);
    expect(result.checked).toEqual([]);
    void feeId;
  });

  it("holds clearance while a discipline case is open", async () => {
    const on = await enabledModules(s.school.id);
    const incidentId = await withTenant(s.school.id, async (tx) => {
      const [row] = await tx
        .insert(incidents)
        .values({
          schoolId: s.school.id,
          studentId: s.students[1].id,
          onDate: "2026-09-01",
          summary: "Open case",
        })
        .returning();
      return row.id;
    });

    const held = await withTenant(s.school.id, (tx) =>
      clearanceFor(tx, s.school.id, s.students[1].id, on),
    );
    expect(held.cleared).toBe(false);
    expect(held.reasons.some((r) => /discipline/.test(r))).toBe(true);

    await withTenant(s.school.id, (tx) =>
      tx.update(incidents).set({ status: "resolved" }).where(eq(incidents.id, incidentId)),
    );
    const cleared = await withTenant(s.school.id, (tx) =>
      clearanceFor(tx, s.school.id, s.students[1].id, on),
    );
    expect(cleared.cleared).toBe(true);
  });
});

describe("the links between modules", () => {
  let s: Awaited<ReturnType<typeof makeSchool>>;

  beforeAll(async () => {
    s = await makeSchool();
  });

  afterAll(async () => {
    await dropSchool(s.school.id);
  });

  it("a suspension marks those school days excused in Attendance", async () => {
    // 2026-09-07 is a Monday, which is the seeded slot's weekday.
    await withTenant(s.school.id, (tx) =>
      emit(tx, s.school.id, "discipline.suspension_started", {
        studentId: s.students[0].id,
        startsOn: "2026-09-07",
        endsOn: "2026-09-08",
      }),
    );
    await processEvents(s.school.id);

    const marks = await withTenant(s.school.id, (tx) =>
      tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.schoolId, s.school.id),
            eq(attendanceRecords.studentId, s.students[0].id),
          ),
        ),
    );
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((m) => m.status === "excused")).toBe(true);
    expect(marks.every((m) => m.note === "Suspended")).toBe(true);
  });

  it("a repeat discipline case opens a guidance case, and only one", async () => {
    for (let i = 0; i < 2; i++) {
      await withTenant(s.school.id, (tx) =>
        emit(tx, s.school.id, "discipline.repeat_case", {
          studentId: s.students[1].id,
          incidents: 3,
        }),
      );
      await processEvents(s.school.id);
    }

    const cases = await withTenant(s.school.id, (tx) =>
      tx
        .select()
        .from(guidanceCases)
        .where(
          and(
            eq(guidanceCases.schoolId, s.school.id),
            eq(guidanceCases.studentId, s.students[1].id),
          ),
        ),
    );
    expect(cases).toHaveLength(1);
    expect(cases[0].source).toBe("discipline");
  });

  it("a payment lifts a registrar hold without anyone pressing anything", async () => {
    const [feeId, requestId] = await withTenant(s.school.id, async (tx) => {
      const [fee] = await tx
        .insert(feeItems)
        .values({
          schoolId: s.school.id,
          schoolYearId: s.year.id,
          name: "Tuition",
          amountCentavos: 100_000,
        })
        .returning();
      await tx.insert(studentCharges).values({
        schoolId: s.school.id,
        studentId: s.students[2].id,
        feeItemId: fee.id,
        amountCentavos: fee.amountCentavos,
        chargedOn: "2026-06-15",
      });
      const [request] = await tx
        .insert(registrarRequests)
        .values({
          schoolId: s.school.id,
          studentId: s.students[2].id,
          kind: "certificate",
          status: "on_hold",
          holdReason: "Fees owing",
        })
        .returning();
      return [fee.id, request.id];
    });
    void feeId;

    await withTenant(s.school.id, async (tx) => {
      await tx.insert(studentPayments).values({
        schoolId: s.school.id,
        studentId: s.students[2].id,
        amountCentavos: 100_000,
        receiptNo: "OR-9",
        paidOn: "2026-07-05",
      });
      await emit(tx, s.school.id, "billing.balance_changed", {
        studentId: s.students[2].id,
      });
    });
    await processEvents(s.school.id);

    const [after] = await withTenant(s.school.id, (tx) =>
      tx.select().from(registrarRequests).where(eq(registrarRequests.id, requestId)),
    );
    expect(after.status).toBe("cleared");
    expect(after.holdReason).toBeNull();
  });

  it("a sanction that is not a suspension touches nothing in Attendance", async () => {
    const before = await withTenant(s.school.id, (tx) =>
      tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.schoolId, s.school.id),
            eq(attendanceRecords.studentId, s.students[2].id),
          ),
        ),
    );
    await withTenant(s.school.id, async (tx) => {
      const [incident] = await tx
        .insert(incidents)
        .values({
          schoolId: s.school.id,
          studentId: s.students[2].id,
          onDate: "2026-09-14",
          summary: "Noise in the corridor",
        })
        .returning();
      await tx.insert(sanctions).values({
        schoolId: s.school.id,
        incidentId: incident.id,
        kind: "warning",
        startsOn: "2026-09-14",
      });
    });
    await processEvents(s.school.id);

    const after = await withTenant(s.school.id, (tx) =>
      tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.schoolId, s.school.id),
            eq(attendanceRecords.studentId, s.students[2].id),
          ),
        ),
    );
    expect(after.length).toBe(before.length);
  });
});
