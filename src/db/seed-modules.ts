/**
 * Demo data for the modules beyond Core and Attendance, so every screen has
 * something real on it and the cross-module links can be seen working.
 */

import { withTenant } from "./index";
import {
  activities,
  announcements,
  clubMemberships,
  clubs,
  feeItems,
  gradingPeriods,
  guidanceCases,
  incidents,
  offenseLevels,
  registrarRequests,
  sanctions,
  scores,
  serviceHours,
  studentCharges,
  studentPayments,
} from "./schema";
import { processEvents } from "@/lib/events";
import { clearanceFor } from "@/modules/registrar/clearance";
import { enabledModules } from "@/lib/tenant";
import { emit } from "@/lib/audit";

export type ModuleSeedContext = {
  schoolId: string;
  yearId: string;
  sectionId: string;
  subjectIds: string[];
  studentIds: string[];
  studentNumbers: string[];
  teacherId: string;
  principalId: string;
  ownerId: string;
};

const PERIODS = [
  { name: "First quarter", sequence: 1, startsOn: "2026-06-01", endsOn: "2026-08-14" },
  { name: "Second quarter", sequence: 2, startsOn: "2026-08-17", endsOn: "2026-10-30" },
  { name: "Third quarter", sequence: 3, startsOn: "2026-11-03", endsOn: "2027-01-23" },
  { name: "Fourth quarter", sequence: 4, startsOn: "2027-01-26", endsOn: "2027-03-31" },
];

export async function seedModules(ctx: ModuleSeedContext) {
  const on = await enabledModules(ctx.schoolId);

  await withTenant(ctx.schoolId, async (tx) => {
    /* ---- Grades: two quarters entered, the first one closed ---------- */
    const periods = [];
    for (const p of PERIODS) {
      const [row] = await tx
        .insert(gradingPeriods)
        .values({
          schoolId: ctx.schoolId,
          schoolYearId: ctx.yearId,
          ...p,
          closedAt: p.sequence === 1 ? new Date("2026-08-20") : null,
        })
        .onConflictDoNothing()
        .returning();
      if (row) periods.push(row);
    }

    // A spread that looks like a real class: most in the 80s, a few below 75.
    for (const period of periods.slice(0, 2)) {
      for (const [si, studentId] of ctx.studentIds.entries()) {
        for (const [ji, subjectId] of ctx.subjectIds.entries()) {
          const base = 78 + ((si * 7 + ji * 11) % 18);
          const score = si % 13 === 3 ? 68 + (ji % 5) : base;
          await tx
            .insert(scores)
            .values({
              schoolId: ctx.schoolId,
              gradingPeriodId: period.id,
              studentId,
              subjectId,
              score,
              enteredByUserId: ctx.teacherId,
            })
            .onConflictDoNothing();
        }
      }
    }

    /* ---- Portal: one notice to the whole school ---------------------- */
    await tx.insert(announcements).values({
      schoolId: ctx.schoolId,
      title: "Second quarter cards are out on Friday",
      body:
        "Report cards for the second quarter are released on Friday afternoon. " +
        "Parents may collect them from the adviser, or read them in the portal.",
      postedByUserId: ctx.principalId,
    });

    /* ---- Discipline: a handbook, two incidents, one suspension ------- */
    const levelRows = [];
    for (const l of [
      { name: "Late without excuse", severity: "minor" as const },
      { name: "Cutting class", severity: "major" as const },
      { name: "Fighting", severity: "grave" as const },
    ]) {
      const [row] = await tx
        .insert(offenseLevels)
        .values({ schoolId: ctx.schoolId, ...l })
        .onConflictDoNothing()
        .returning();
      if (row) levelRows.push(row);
    }

    const [incidentA] = await tx
      .insert(incidents)
      .values({
        schoolId: ctx.schoolId,
        studentId: ctx.studentIds[4],
        offenseLevelId: levelRows[1]?.id ?? null,
        onDate: "2026-09-18",
        summary: "Left campus during the second period without a gate pass.",
        status: "resolved",
        reportedByUserId: ctx.teacherId,
      })
      .returning();
    await tx.insert(sanctions).values({
      schoolId: ctx.schoolId,
      incidentId: incidentA.id,
      kind: "community_service",
      startsOn: "2026-09-21",
      endsOn: "2026-09-22",
      note: "Two afternoons with the grounds crew.",
      issuedByUserId: ctx.ownerId,
    });

    await tx.insert(incidents).values({
      schoolId: ctx.schoolId,
      studentId: ctx.studentIds[7],
      offenseLevelId: levelRows[0]?.id ?? null,
      onDate: "2026-10-01",
      summary: "Third late arrival this month, no note from home.",
      reportedByUserId: ctx.teacherId,
    });

    /* ---- Guidance: one open case ------------------------------------- */
    if (on.has("guidance")) {
      await tx.insert(guidanceCases).values({
        schoolId: ctx.schoolId,
        studentId: ctx.studentIds[4],
        title: "Settling in after a transfer",
        source: "teacher_referral",
        openedByUserId: ctx.ownerId,
      });
    }

    /* ---- SAO and Chaplain: a club, an event, a mass ------------------ */
    const [club] = await tx
      .insert(clubs)
      .values({ schoolId: ctx.schoolId, name: "Science Club", moderatorUserId: ctx.teacherId })
      .onConflictDoNothing()
      .returning();
    if (club) {
      for (const studentId of ctx.studentIds.slice(0, 12)) {
        await tx
          .insert(clubMemberships)
          .values({ schoolId: ctx.schoolId, clubId: club.id, studentId })
          .onConflictDoNothing();
      }
    }

    for (const a of [
      {
        kind: "sao_event" as const,
        name: "Coastal clean-up drive",
        onDate: "2026-09-12",
        location: "Barangay shoreline",
        serviceHours: 4,
      },
      {
        kind: "ministry" as const,
        name: "First Friday mass",
        onDate: "2026-10-02",
        location: "School chapel",
        serviceHours: 1,
      },
    ]) {
      const [activity] = await tx
        .insert(activities)
        .values({ schoolId: ctx.schoolId, ...a, organizedByUserId: ctx.ownerId })
        .returning();
      for (const studentId of ctx.studentIds.slice(0, 20)) {
        await tx
          .insert(serviceHours)
          .values({
            schoolId: ctx.schoolId,
            studentId,
            activityId: activity.id,
            hours: a.serviceHours,
          })
          .onConflictDoNothing();
      }
    }

    /* ---- Billing: a year of fees, most of it paid -------------------- */
    const feeRows = [];
    for (const f of [
      { name: "Tuition, first semester", amountCentavos: 1_200_000, dueOn: "2026-07-15" },
      { name: "Miscellaneous", amountCentavos: 350_000, dueOn: "2026-07-15" },
      { name: "Books and modules", amountCentavos: 280_000, dueOn: "2026-08-15" },
    ]) {
      const [row] = await tx
        .insert(feeItems)
        .values({ schoolId: ctx.schoolId, schoolYearId: ctx.yearId, ...f })
        .onConflictDoNothing()
        .returning();
      if (row) feeRows.push(row);
    }

    for (const [i, studentId] of ctx.studentIds.entries()) {
      let charged = 0;
      for (const fee of feeRows) {
        await tx
          .insert(studentCharges)
          .values({
            schoolId: ctx.schoolId,
            studentId,
            feeItemId: fee.id,
            amountCentavos: fee.amountCentavos,
            chargedOn: "2026-06-15",
          })
          .onConflictDoNothing();
        charged += fee.amountCentavos;
      }
      // Four students in five are paid up; the rest carry a balance.
      const paid = i % 5 === 2 ? Math.round(charged * 0.4) : charged;
      if (paid > 0) {
        await tx.insert(studentPayments).values({
          schoolId: ctx.schoolId,
          studentId,
          amountCentavos: paid,
          method: "cash",
          receiptNo: `OR-${String(1000 + i)}`,
          receivedByUserId: ctx.ownerId,
          paidOn: "2026-07-10",
        });
      }
    }

    /* ---- Registrar: one released, one held by an unpaid balance ------ */
    if (on.has("registrar")) {
      for (const [i, studentId] of [ctx.studentIds[0], ctx.studentIds[2]].entries()) {
        const clearance = await clearanceFor(tx, ctx.schoolId, studentId, on);
        await tx.insert(registrarRequests).values({
          schoolId: ctx.schoolId,
          studentId,
          kind: i === 0 ? "certificate" : "transcript",
          purpose: i === 0 ? "Scholarship application" : "Transfer to another school",
          status: clearance.cleared ? "cleared" : "on_hold",
          holdReason: clearance.cleared ? null : clearance.reasons.join(" "),
          handledByUserId: ctx.ownerId,
        });
        await emit(tx, ctx.schoolId, "registrar.clearance_requested", {
          studentId,
          cleared: clearance.cleared,
        });
      }
    }

  });

  await processEvents(ctx.schoolId, 5000);
}
