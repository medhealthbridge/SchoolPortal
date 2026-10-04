"use server";

import { goTo, type Navigation } from "@/lib/nav";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { students, users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { createSchoolSession, currentSchool } from "@/lib/session";

export type SignInResult = { error?: string } & Partial<Navigation>;

export async function signIn(
  _prev: SignInResult | null,
  formData: FormData,
): Promise<SignInResult> {
  const school = await currentSchool();
  if (!school) return { error: "Unknown school." };

  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) return { error: "Enter your email or student ID and password." };

  const user = await withTenant(school.id, async (tx) => {
    // Staff and parents sign in with an email; students may use their ID.
    const byEmail = await tx
      .select()
      .from(users)
      .where(and(eq(users.schoolId, school.id), eq(users.email, identifier.toLowerCase())))
      .limit(1);
    if (byEmail[0]) return byEmail[0];

    const claimed = await tx
      .select({ userId: students.claimedByUserId })
      .from(students)
      .where(and(eq(students.schoolId, school.id), eq(students.studentNumber, identifier)))
      .limit(1);
    if (!claimed[0]?.userId) return null;
    const byId = await tx.select().from(users).where(eq(users.id, claimed[0].userId)).limit(1);
    return byId[0] ?? null;
  });

  if (!user || user.status !== "active" || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "That sign-in did not match our records." };
  }

  await withTenant(school.id, async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: user.id,
      actorLabel: user.name,
      action: "user.signed_in",
      entity: "users",
      entityId: user.id,
    });
  });

  await createSchoolSession(user.id, school.id);
  return goTo("/");
}

export async function signOutAction() {
  const { destroySession, SCHOOL_COOKIE } = await import("@/lib/session");
  await destroySession(SCHOOL_COOKIE);
  return goTo("/login");
}
