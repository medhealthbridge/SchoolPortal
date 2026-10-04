import { and, eq, isNull, inArray } from "drizzle-orm";
import { db, withTenant } from "@/db";
import {
  events,
  notifications,
  schools,
  studentGuardians,
  students,
  userRoles,
  users,
} from "@/db/schema";
import { deliver } from "./messaging";
import { enabledModules } from "./tenant";

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
      const payload = event.payload as Record<string, string | number>;

      if (event.type === "student.marked_absent" && on.has("portal")) {
        const studentId = String(payload.studentId);
        const [student] = await tx
          .select()
          .from(students)
          .where(eq(students.id, studentId))
          .limit(1);
        if (student) {
          const guardians = await tx
            .select({ user: users })
            .from(studentGuardians)
            .innerJoin(users, eq(users.id, studentGuardians.guardianUserId))
            .where(eq(studentGuardians.studentId, studentId));

          for (const g of guardians) {
            const body = `${school.name}: ${student.firstName} ${student.lastName} was marked absent on ${payload.onDate}.`;
            if (g.user.phone) {
              await deliver({ schoolId, channel: "sms", to: g.user.phone, body }, tx);
            }
            await tx.insert(notifications).values({
              schoolId,
              userId: g.user.id,
              title: "Absence recorded",
              body,
            });
          }
        }
      }

      if (event.type === "student.marked_late" && on.has("discipline")) {
        await notifyRoles(tx, schoolId, ["discipline_officer"], {
          title: "Late mark recorded",
          body: `A student was marked late on ${payload.onDate}. It counts toward their tardiness record.`,
        });
      }

      if (event.type === "student.absence_streak") {
        const roles: ("adviser" | "guidance_counselor")[] = ["adviser"];
        if (on.has("guidance")) roles.push("guidance_counselor");
        await notifyRoles(tx, schoolId, roles, {
          title: `${payload.days}-day absence streak`,
          body: `A student has been absent ${payload.days} school days in a row, as of ${payload.onDate}.`,
        });
      }

      await tx
        .update(events)
        .set({ processedAt: new Date() })
        .where(eq(events.id, event.id));
    }

    return { processed: pending.length };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function notifyRoles(
  tx: Tx,
  schoolId: string,
  roles: ("adviser" | "guidance_counselor" | "discipline_officer")[],
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
