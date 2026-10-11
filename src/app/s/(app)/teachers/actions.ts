"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { invites, userRoles, users } from "@/db/schema";
import { endSessionsOf } from "@/lib/session";
import { requirePermission } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { deliver } from "@/lib/messaging";
import { schoolUrl } from "@/lib/school-url";
import { TEACHING_ROLES } from "@/lib/staff";

type ActionResult = { ok?: string; error?: string; issues?: string[] } | null;

/**
 * Adds a teacher by invite. The registrar, the principal and the school admin
 * may do this; they can give the teacher or adviser role and nothing else, so
 * this page can never be used to make someone an admin.
 */
export async function addTeacher(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("staff.manage");
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "teacher");
  if (name.length < 2) return { error: "Enter the teacher's name." };
  if (!z.string().email().safeParse(email).success) return { error: "Enter a valid email address." };
  if (!(TEACHING_ROLES as readonly string[]).includes(role))
    return { error: "A teacher is a teacher or an adviser." };

  const token = randomBytes(24).toString("base64url");
  const outcome = await withTenant(school.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(users)
      .where(and(eq(users.schoolId, school.id), eq(users.email, email)))
      .limit(1);
    if (existing) {
      const held = await tx
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, existing.id));
      if (held.some((h) => (TEACHING_ROLES as readonly string[]).includes(h.role)))
        return { error: `${existing.name} is already a teacher here.` };
    }
    const [open] = await tx
      .select()
      .from(invites)
      .where(
        and(eq(invites.schoolId, school.id), eq(invites.email, email), isNull(invites.acceptedAt)),
      )
      .limit(1);
    if (open) return { error: `${open.name} already has an invite waiting. Its link is below.` };

    await tx
      .insert(invites)
      .values({ schoolId: school.id, email, name, role: role as "teacher" | "adviser", token });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "teacher.invited",
      after: { email, role },
    });
    return { ok: true as const };
  });
  if ("error" in outcome) return { error: outcome.error };

  await deliver({
    schoolId: school.id,
    channel: "email",
    to: email,
    subject: `Join ${school.name} on SchoolPortal`,
    body: `${session.name} added you as a teacher at ${school.name}. Set your password at ${schoolUrl(school.subdomain, `/invite/${token}`)}`,
  });

  revalidatePath("/teachers");
  return {
    ok: `${name} is added. We email the invite if this site can send mail; otherwise copy their link from “Waiting to join” below and send it yourself.`,
  };
}

/**
 * Stops or restores a teacher's sign-in. Only teaching accounts: an office
 * account (admin, registrar, principal) is changed on People by the school
 * admin, so nobody here can lock out the people above them.
 */
export async function setTeacherStatus(form: FormData) {
  const { school, session } = await requirePermission("staff.manage");
  const userId = String(form.get("userId") ?? "");
  const status = String(form.get("status") ?? "") === "active" ? "active" : "disabled";
  if (userId === session.userId) return;

  await withTenant(school.id, async (tx) => {
    const [person] = await tx
      .select()
      .from(users)
      .where(and(eq(users.schoolId, school.id), eq(users.id, userId)))
      .limit(1);
    if (!person) return;
    const held = await tx
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    const roles = held.map((h) => h.role as string);
    const teachingOnly =
      roles.length > 0 && roles.every((r) => (TEACHING_ROLES as readonly string[]).includes(r));
    if (!teachingOnly) return;

    await tx.update(users).set({ status }).where(eq(users.id, userId));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: status === "active" ? "teacher.enabled" : "teacher.disabled",
      entity: "users",
      entityId: userId,
    });
  });
  // Signed-in phones are signed out at once, not at the session's natural end.
  if (status === "disabled") await endSessionsOf(school.id, userId);
  revalidatePath("/teachers");
}

export async function cancelTeacherInvite(form: FormData) {
  const { school, session } = await requirePermission("staff.manage");
  const id = String(form.get("id") ?? "");
  await withTenant(school.id, async (tx) => {
    const [invite] = await tx
      .select()
      .from(invites)
      .where(and(eq(invites.schoolId, school.id), eq(invites.id, id), isNull(invites.acceptedAt)))
      .limit(1);
    if (!invite || !(TEACHING_ROLES as readonly string[]).includes(invite.role)) return;
    await tx.delete(invites).where(eq(invites.id, id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "teacher.invite_cancelled",
      after: { email: invite.email },
    });
  });
  revalidatePath("/teachers");
}
