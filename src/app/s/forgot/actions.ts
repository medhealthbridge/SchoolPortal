"use server";

import { db, withTenant } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { accountFor, issueReset, SELF_HOURS, useReset } from "@/lib/password-reset";
import { deliver } from "@/lib/messaging";
import { schoolUrl } from "@/lib/school-url";
import { currentSchool } from "@/lib/session";
import { attempt, retryMessage, SIGNUP } from "@/lib/throttle";
import { clientIp } from "@/lib/request";
import { audit } from "@/lib/audit";
import { goTo, type Navigation } from "@/lib/nav";

type Result = ({ ok?: string; error?: string } & Partial<Navigation>) | null;

/**
 * Always the same answer, whether or not the account exists, so this page
 * cannot be used to find out who has an account here.
 */
export async function requestReset(_prev: Result, form: FormData): Promise<Result> {
  const school = await currentSchool();
  if (!school) return { error: "Unknown school." };
  const identifier = String(form.get("identifier") ?? "");
  const limit = await attempt(`forgot:${school.id}:${await clientIp()}`, SIGNUP);
  if (!limit.allowed) return { error: retryMessage(limit.retryInSeconds) };

  const sent = await withTenant(school.id, async (tx) => {
    const user = await accountFor(tx, school.id, identifier);
    if (!user || !user.email || user.status === "disabled") return null;
    const token = await issueReset(tx, { schoolId: school.id, userId: user.id, hours: SELF_HOURS });
    return { email: user.email, token };
  });
  if (sent) {
    await deliver({
      schoolId: school.id,
      channel: "email",
      to: sent.email,
      subject: `Set a new password for ${school.name}`,
      body: `Someone asked to reset your SchoolPortal password. If it was you, open ${schoolUrl(school.subdomain, `/reset/${sent.token}`)} within an hour. If it was not, ignore this email.`,
    });
  }
  return {
    ok: "If an account here uses that, a link to set a new password is on its way by email. No email, or nothing arrived? Ask your school office for a reset link.",
  };
}

export async function setNewPassword(_prev: Result, form: FormData): Promise<Result> {
  const school = await currentSchool();
  if (!school) return { error: "Unknown school." };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords are not the same." };
  const limit = await attempt(`reset:${school.id}:${await clientIp()}`, SIGNUP);
  if (!limit.allowed) return { error: retryMessage(limit.retryInSeconds) };

  const outcome = await withTenant(school.id, async (tx) => {
    const done = await useReset(tx, school.id, String(form.get("token") ?? ""), password);
    if ("error" in done) return done;
    await audit(tx, {
      schoolId: school.id,
      actorUserId: done.userId,
      actorLabel: "password reset",
      action: "user.password_reset",
      entity: "users",
      entityId: done.userId,
    });
    return done;
  });
  if ("error" in outcome) return { error: outcome.error };
  // Every phone and laptop still signed in with the old password is signed out.
  await db.delete(sessions).where(eq(sessions.userId, outcome.userId));
  return goTo("/login?reset=1");
}
