"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { students } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { linkGuardian } from "@/lib/guardians";
import { attempt, retryMessage, SIGNUP } from "@/lib/throttle";

type Result = { ok?: string; error?: string } | null;

/**
 * A signed-in parent adds another child with the student ID and the parent
 * code the school printed. The child joins this account; no second account is
 * made and no password is asked twice.
 */
export async function addChildByCode(_prev: Result, form: FormData): Promise<Result> {
  const { school, session } = await requireUser();
  if (!session.roles.includes("parent")) return { error: "Only a parent account can add a child." };
  const studentNumber = String(form.get("studentNumber") ?? "").trim();
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (!studentNumber || !code) return { error: "Enter the student ID and the parent code." };

  const limit = await attempt(`add-child:${school.id}:${session.userId}`, SIGNUP);
  if (!limit.allowed) return { error: retryMessage(limit.retryInSeconds) };

  const outcome = await withTenant(school.id, async (tx) => {
    const [student] = await tx
      .select()
      .from(students)
      .where(
        and(
          eq(students.schoolId, school.id),
          eq(students.studentNumber, studentNumber),
          eq(students.parentCode, code),
        ),
      )
      .limit(1);
    if (!student) return { error: "That student ID and parent code did not match." };
    await linkGuardian(tx, school.id, student.id, session.userId, "parent");
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "parent.linked_child",
      entity: "students",
      entityId: student.id,
      after: { via: "code" },
    });
    return { ok: `${student.firstName} ${student.lastName} is linked to your account.` };
  });

  revalidatePath("/me");
  revalidatePath("/");
  return outcome;
}
