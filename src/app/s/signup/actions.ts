"use server";

import { goTo, type Navigation } from "@/lib/nav";
import { and, eq, isNull } from "drizzle-orm";
import { withTenant } from "@/db";
import { studentGuardians, students, userRoles, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { createSchoolSession, currentSchool } from "@/lib/session";

/**
 * Rate limit on student-ID signup so IDs cannot be guessed in bulk. In-memory
 * is enough for one instance; behind several, move the counter to Postgres or
 * the edge store — the shape stays the same.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;

function tooManyAttempts(key: string) {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || row.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  row.count += 1;
  return row.count > MAX_ATTEMPTS;
}

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

  if (tooManyAttempts(`${school.id}:student`))
    return { error: "Too many attempts. Try again in a few minutes." };
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

  if (tooManyAttempts(`${school.id}:parent`))
    return { error: "Too many attempts. Try again in a few minutes." };
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

