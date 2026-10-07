"use server";

import { goTo, type Navigation } from "@/lib/nav";
import { and, eq, isNull } from "drizzle-orm";
import { withTenant } from "@/db";
import { studentGuardians, students, userRoles, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { createSchoolSession, currentSchool } from "@/lib/session";
import { attempt, retryMessage, SIGNUP } from "@/lib/throttle";
import { clientIp } from "@/lib/request";

type Result = ({ error?: string } & Partial<Navigation>) | null;

export async function studentSignUp(_prev: Result, formData: FormData): Promise<Result> {
  const school = await currentSchool();
  if (!school) return { error: "Unknown school." };
  if (school.status === "suspended") return { error: "This school is on hold." };

  const studentNumber = String(formData.get("studentNumber") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const password = String(formData.get("password") ?? "");

  const limit = await attempt(`signup-student:${school.id}:${await clientIp()}`, SIGNUP);
  if (!limit.allowed) return { error: retryMessage(limit.retryInSeconds) };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const outcome = await withTenant(school.id, async (tx) => {
    // "The system matches an unclaimed record" — a claimed ID can never be
    // claimed twice, which is what the isNull() below enforces.
    const [student] = await tx
      .select()
      .from(students)
      .where(
        and(
          eq(students.schoolId, school.id),
          eq(students.studentNumber, studentNumber),
          eq(students.activationCode, code),
          isNull(students.claimedByUserId),
        ),
      )
      .limit(1);
    if (!student) return { error: "That student ID and activation code did not match." };

    const [user] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email,
        name: name || `${student.firstName} ${student.lastName}`,
        passwordHash: await hashPassword(password),
        status: "active",
      })
      .returning();

    await tx.insert(userRoles).values({ schoolId: school.id, userId: user.id, role: "student" });
    await tx
      .update(students)
      .set({ claimedByUserId: user.id, claimedAt: new Date() })
      .where(eq(students.id, student.id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: user.id,
      actorLabel: user.name,
      action: "student.account_claimed",
      entity: "students",
      entityId: student.id,
    });
    return { userId: user.id };
  });

  if ("error" in outcome) return outcome;
  await createSchoolSession(outcome.userId, school.id);
  return goTo("/");
}

export async function parentSignUp(_prev: Result, formData: FormData): Promise<Result> {
  const school = await currentSchool();
  if (!school) return { error: "Unknown school." };
  if (school.status === "suspended") return { error: "This school is on hold." };

  const studentNumber = String(formData.get("studentNumber") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const limit = await attempt(`signup-parent:${school.id}:${await clientIp()}`, SIGNUP);
  if (!limit.allowed) return { error: retryMessage(limit.retryInSeconds) };
  if (!email) return { error: "Enter your email address." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

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

    // One parent can link several children, so an existing parent account is
    // reused rather than duplicated.
    const [existing] = await tx
      .select()
      .from(users)
      .where(and(eq(users.schoolId, school.id), eq(users.email, email)))
      .limit(1);

    // An existing account is only reused by someone who can prove it is theirs.
    // Without this check, a student ID, its parent code and somebody else's
    // email were enough to be signed in as that person, with every child
    // already linked to them.
    if (existing) {
      if (existing.status !== "active" || !(await verifyPassword(password, existing.passwordHash))) {
        return {
          error:
            "An account with that email already exists. Enter its password to add this child, or sign in and add the child from My records.",
        };
      }
      const held = await tx
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, existing.id));
      if (!held.some((r) => r.role === "parent"))
        await tx.insert(userRoles).values({ schoolId: school.id, userId: existing.id, role: "parent" });
    }

    let userId = existing?.id;
    if (!userId) {
      const [user] = await tx
        .insert(users)
        .values({
          schoolId: school.id,
          email,
          name,
          passwordHash: await hashPassword(password),
          status: "active",
        })
        .returning();
      userId = user.id;
      await tx.insert(userRoles).values({ schoolId: school.id, userId, role: "parent" });
    }

    await tx
      .insert(studentGuardians)
      .values({
        schoolId: school.id,
        studentId: student.id,
        guardianUserId: userId,
        relationship: "parent",
      })
      .onConflictDoNothing();

    await audit(tx, {
      schoolId: school.id,
      actorUserId: userId,
      actorLabel: name || email,
      action: "parent.linked_child",
      entity: "students",
      entityId: student.id,
    });
    return { userId };
  });

  if ("error" in outcome) return outcome;
  await createSchoolSession(outcome.userId!, school.id);
  return goTo("/");
}

