"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { announcements, notifications, studentGuardians, students, enrollments } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { and } from "drizzle-orm";

type Result = { ok?: string; error?: string } | null;

/**
 * Posting an announcement also drops a notification for every guardian of the
 * section it is aimed at, so a parent sees it where they already look.
 */
export async function postAnnouncement(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requirePermission("portal.post");
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const sectionId = String(form.get("sectionId") ?? "") || null;
  if (!title || !body) return { error: "An announcement needs a title and a message." };

  const reached = await withTenant(school.id, async (tx) => {
    const [row] = await tx
      .insert(announcements)
      .values({
        schoolId: school.id,
        title,
        body,
        sectionId,
        postedByUserId: session.userId,
      })
      .returning();

    const guardians = sectionId
      ? await tx
          .selectDistinct({ userId: studentGuardians.guardianUserId })
          .from(studentGuardians)
          .innerJoin(students, eq(students.id, studentGuardians.studentId))
          .innerJoin(enrollments, eq(enrollments.studentId, students.id))
          .where(
            and(
              eq(studentGuardians.schoolId, school.id),
              eq(enrollments.sectionId, sectionId),
              eq(enrollments.status, "active"),
            ),
          )
      : await tx
          .selectDistinct({ userId: studentGuardians.guardianUserId })
          .from(studentGuardians)
          .where(eq(studentGuardians.schoolId, school.id));

    for (const g of guardians) {
      await tx.insert(notifications).values({
        schoolId: school.id,
        userId: g.userId,
        title,
        body: body.slice(0, 280),
      });
    }

    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "announcement.posted",
      entity: "announcements",
      entityId: row.id,
      after: { title, sectionId, guardians: guardians.length },
    });
    return guardians.length;
  });

  revalidatePath("/announcements");
  return {
    ok:
      reached === 0
        ? "Posted. No guardian accounts are linked yet, so nobody was notified."
        : `Posted, and ${reached} ${reached === 1 ? "guardian" : "guardians"} notified.`,
  };
}
