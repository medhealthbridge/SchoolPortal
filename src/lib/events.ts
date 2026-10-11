import { and, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, withTenant, type Tx } from "@/db";
import {
  attendanceRecords,
  enrollments,
  events,
  feeItems,
  guidanceCases,
  notifications,
  registrarRequests,
  schoolYears,
  schools,
  sections,
  studentCharges,
  studentGuardians,
  students,
  timetableSlots,
  userRoles,
  users,
} from "@/db/schema";
import { deliver } from "./messaging";
import { enabledModules } from "./tenant";
import { clearanceFor } from "@/modules/registrar/clearance";
import { balanceFor } from "@/modules/billing/queries";
import { peso } from "./pricing";
import { todayIso } from "./format";

type Payload = Record<string, string | number | boolean>;

/**
 * The event queue is the only path between modules. A module that is switched
 * off simply has no listener, so nothing happens and nothing breaks.
 *
 * Run after a write, and again from a scheduled job to pick up anything a
 * crashed request left behind.
 */
export async function processEvents(schoolId: string, limit = 200) {
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  if (!school) return { processed: 0 };

  // "Alerts, SMS and scheduled jobs pause for a suspended school."
  if (school.status === "suspended") return { processed: 0, paused: true as const };

  const on = await enabledModules(schoolId);

  return withTenant(schoolId, async (tx) => {
    const pending = await tx
      .select()
      .from(events)
      .where(and(eq(events.schoolId, schoolId), isNull(events.processedAt)))
      .limit(limit);

    for (const event of pending) {
      const payload = event.payload as Payload;

      switch (event.type) {
        case "student.marked_absent":
          if (on.has("portal")) {
            await tellGuardians(
              tx,
              schoolId,
              String(payload.studentId),
              school.name,
              (student) =>
                `${school.name}: ${student.firstName} ${student.lastName} was marked absent on ${payload.onDate}.`,
              "Absence recorded",
            );
          }
          break;

        case "student.marked_late":
          if (on.has("discipline")) {
            await notifyRoles(tx, schoolId, ["discipline_officer"], {
              title: "Late mark recorded",
              body: `A student was marked late on ${payload.onDate}. It counts toward their tardiness record.`,
            });
          }
          break;

        case "student.absence_streak": {
          const roles: Role[] = ["adviser"];
          if (on.has("guidance")) roles.push("guidance_counselor");
          await notifyRoles(tx, schoolId, roles, {
            title: `${payload.days}-day absence streak`,
            body: `A student has been absent ${payload.days} school days in a row, as of ${payload.onDate}.`,
          });
          if (on.has("guidance")) {
            await openGuidanceCase(
              tx,
              schoolId,
              String(payload.studentId),
              `Absent ${payload.days} school days in a row`,
              "attendance",
            );
          }
          break;
        }

        case "student.failing":
          if (on.has("guidance")) {
            await notifyRoles(tx, schoolId, ["guidance_counselor"], {
              title: "A grade below 75",
              body: `A student scored ${payload.score} in ${payload.period}. Open a case if it is part of a pattern.`,
            });
          }
          break;

        case "grade.period_closed":
          if (on.has("portal")) {
            await notifyRoles(tx, schoolId, ["parent"], {
              title: `${payload.name} is closed`,
              body: "Report cards are ready to view in the portal.",
            });
          }
          break;

        case "discipline.suspension_started":
          // Attendance marks those school days excused, not absent.
          if (on.has("attendance")) {
            const marked = await excuseSuspension(
              tx,
              schoolId,
              String(payload.studentId),
              String(payload.startsOn),
              String(payload.endsOn),
            );
            if (marked > 0) {
              await notifyRoles(tx, schoolId, ["adviser"], {
                title: "Suspension recorded",
                body: `${marked} class marks were set to excused for the suspension.`,
              });
            }
          }
          break;

        case "discipline.repeat_case":
          if (on.has("guidance")) {
            await openGuidanceCase(
              tx,
              schoolId,
              String(payload.studentId),
              `${payload.incidents} discipline incidents this year`,
              "discipline",
            );
          }
          break;

        case "student.enrolled":
          // Billing charges the year's fees to a newly enrolled student.
          if (on.has("billing")) {
            await chargeOnEnrolment(tx, schoolId, String(payload.studentId));
          }
          break;

        case "billing.balance_changed": {
          if (payload.studentId) {
            const studentId = String(payload.studentId);
            // Registrar re-checks anything held for this student.
            if (on.has("registrar")) {
              await recheckHolds(tx, schoolId, studentId, on);
            }
            if (on.has("portal")) {
              const balance = await balanceFor(tx, schoolId, studentId);
              await tellGuardians(
                tx,
                schoolId,
                studentId,
                school.name,
                (student) =>
                  balance.balanceCentavos > 0
                    ? `${school.name}: ${student.firstName}'s balance is now ${peso(balance.balanceCentavos)}.`
                    : `${school.name}: ${student.firstName}'s account is fully paid.`,
                "Fees updated",
              );
            }
          }
          break;
        }

        default:
          // Nothing listens. The event is still marked processed, so the
          // queue does not grow and a module switched on later starts from
          // that day rather than replaying history.
          break;
      }

      await tx
        .update(events)
        .set({ processedAt: new Date() })
        .where(eq(events.id, event.id));
    }

    return { processed: pending.length };
  });
}

type Role = "adviser" | "guidance_counselor" | "discipline_officer" | "parent";

async function notifyRoles(
  tx: Tx,
  schoolId: string,
  roles: Role[],
  message: { title: string; body: string },
) {
  const recipients = await tx
    .selectDistinct({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.schoolId, schoolId), inArray(userRoles.role, roles)));

  for (const r of recipients) {
    await tx.insert(notifications).values({
      schoolId,
      userId: r.userId,
      title: message.title,
      body: message.body,
    });
  }
}

async function tellGuardians(
  tx: Tx,
  schoolId: string,
  studentId: string,
  _schoolName: string,
  body: (student: typeof students.$inferSelect) => string,
  title: string,
) {
  const [student] = await tx
    .select()
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!student) return;

  const guardians = await tx
    .select({ user: users })
    .from(studentGuardians)
    .innerJoin(users, eq(users.id, studentGuardians.guardianUserId))
    .where(eq(studentGuardians.studentId, studentId));

  const text = body(student);
  for (const g of guardians) {
    if (g.user.phone) {
      await deliver({ schoolId, channel: "sms", to: g.user.phone, body: text }, tx);
    }
    await tx.insert(notifications).values({
      schoolId,
      userId: g.user.id,
      title,
      body: text,
    });
  }
}

/** Opens a case unless one with the same title is already open. */
async function openGuidanceCase(
  tx: Tx,
  schoolId: string,
  studentId: string,
  title: string,
  source: string,
) {
  const existing = await tx
    .select({ id: guidanceCases.id })
    .from(guidanceCases)
    .where(
      and(
        eq(guidanceCases.schoolId, schoolId),
        eq(guidanceCases.studentId, studentId),
        eq(guidanceCases.title, title),
      ),
    )
    .limit(1);
  if (existing.length) return;

  await tx.insert(guidanceCases).values({ schoolId, studentId, title, source });
}

/**
 * Every class the student has on each school day of the suspension becomes
 * an excused mark. Existing marks are left alone — a teacher who already
 * recorded the day knows more than this does.
 */
async function excuseSuspension(
  tx: Tx,
  schoolId: string,
  studentId: string,
  startsOn: string,
  endsOn: string,
) {
  const [enrolment] = await tx
    .select({ sectionId: enrollments.sectionId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.schoolId, schoolId),
        eq(enrollments.studentId, studentId),
        eq(enrollments.status, "active"),
      ),
    )
    .limit(1);
  if (!enrolment) return 0;

  const slots = await tx
    .select({ id: timetableSlots.id, weekday: timetableSlots.weekday })
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.schoolId, schoolId),
        eq(timetableSlots.sectionId, enrolment.sectionId),
        isNull(timetableSlots.retiredAt),
      ),
    );
  if (slots.length === 0) return 0;

  // The mark needs an author. The discipline office owns the decision, so
  // attribute it there, falling back to any staff account.
  const [officer] = await tx
    .selectDistinct({ userId: userRoles.userId })
    .from(userRoles)
    .where(
      and(eq(userRoles.schoolId, schoolId), eq(userRoles.role, "discipline_officer")),
    )
    .limit(1);
  const [fallback] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.schoolId, schoolId))
    .limit(1);
  const author = officer?.userId ?? fallback?.id;
  if (!author) return 0;

  let marked = 0;
  const end = new Date(`${endsOn}T00:00:00Z`);
  for (
    let day = new Date(`${startsOn}T00:00:00Z`);
    day <= end;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const onDate = day.toISOString().slice(0, 10);
    const weekday = ((day.getUTCDay() + 6) % 7) + 1;
    if (weekday > 5) continue;

    for (const slot of slots.filter((s) => s.weekday === weekday)) {
      const [row] = await tx
        .insert(attendanceRecords)
        .values({
          id: randomUUID(),
          schoolId,
          studentId,
          slotId: slot.id,
          onDate,
          status: "excused",
          note: "Suspended",
          markedByUserId: author,
          markedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (row) marked += 1;
    }
  }
  return marked;
}

/** A new enrolment picks up the fees already defined for its year and level. */
async function chargeOnEnrolment(tx: Tx, schoolId: string, studentId: string) {
  const [enrolment] = await tx
    .select({ schoolYearId: enrollments.schoolYearId, level: sections.level })
    .from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .where(
      and(eq(enrollments.schoolId, schoolId), eq(enrollments.studentId, studentId)),
    )
    .limit(1);
  if (!enrolment) return;

  const [year] = await tx
    .select()
    .from(schoolYears)
    .where(eq(schoolYears.id, enrolment.schoolYearId))
    .limit(1);
  if (!year) return;

  const fees = await tx
    .select()
    .from(feeItems)
    .where(
      and(eq(feeItems.schoolId, schoolId), eq(feeItems.schoolYearId, year.id)),
    );

  for (const fee of fees) {
    if (fee.level && fee.level !== enrolment.level) continue;
    await tx
      .insert(studentCharges)
      .values({
        schoolId,
        studentId,
        feeItemId: fee.id,
        amountCentavos: fee.amountCentavos,
        chargedOn: todayIso(),
      })
      .onConflictDoNothing();
  }
}

/** After a payment, anything held for that student is asked again. */
async function recheckHolds(
  tx: Tx,
  schoolId: string,
  studentId: string,
  on: Awaited<ReturnType<typeof enabledModules>>,
) {
  const held = await tx
    .select()
    .from(registrarRequests)
    .where(
      and(
        eq(registrarRequests.schoolId, schoolId),
        eq(registrarRequests.studentId, studentId),
        eq(registrarRequests.status, "on_hold"),
      ),
    );
  if (held.length === 0) return;

  const clearance = await clearanceFor(tx, schoolId, studentId, on);
  if (!clearance.cleared) return;

  await tx
    .update(registrarRequests)
    .set({ status: "cleared", holdReason: null })
    .where(
      inArray(
        registrarRequests.id,
        held.map((h) => h.id),
      ),
    );
}
