"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { withTenant } from "@/db";
import { guardianInvites } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { deliver } from "@/lib/messaging";
import { schoolUrl } from "@/lib/school-url";
import { createGuardianInvite, mayInviteFor, unlinkGuardian } from "@/lib/guardians";

export type InviteResult = { ok?: string; error?: string; link?: string; phone?: string } | null;

/**
 * A teacher (or the office) invites a parent for one child. The link comes
 * back to the screen as well as going out by email and text, because a school
 * without a mail provider still has to be able to send it by hand.
 */
export async function inviteParent(_prev: InviteResult, form: FormData): Promise<InviteResult> {
  const { school, session } = await requirePermission("guardians.invite");
  const studentId = String(form.get("studentId") ?? "");

  const outcome = await withTenant(school.id, async (tx) => {
    if (!(await mayInviteFor(tx, school.id, session, studentId)))
      return { error: "You can invite parents only for students in your classes." };
    return createGuardianInvite(tx, {
      schoolId: school.id,
      studentId,
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      relationship: String(form.get("relationship") ?? "guardian"),
      invitedByUserId: session.userId,
      invitedByName: session.name,
    });
  });
  if ("error" in outcome) return { error: outcome.error };

  const link = schoolUrl(school.subdomain, `/join/${outcome.token}`);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const phone = String(form.get("phone") ?? "").trim();
  const body = `${session.name} invited you to follow your child at ${school.name}. Open ${link} to see grades, attendance and school news. The link works for 14 days.`;
  await deliver({ schoolId: school.id, channel: "email", to: email, subject: `Follow your child at ${school.name}`, body });
  if (phone) await deliver({ schoolId: school.id, channel: "sms", to: phone, body });

  revalidatePath("/classes", "layout");
  revalidatePath("/students", "layout");
  return {
    ok: outcome.reused
      ? "That invite was already waiting; it now runs for another 14 days. Send this link:"
      : "Invite ready. We email and text it if this site can; otherwise send this link yourself:",
    link,
    phone: phone || undefined,
  };
}

export async function cancelParentInvite(form: FormData) {
  const { school, session } = await requirePermission("guardians.invite");
  const id = String(form.get("id") ?? "");
  await withTenant(school.id, async (tx) => {
    const [invite] = await tx
      .select()
      .from(guardianInvites)
      .where(
        and(
          eq(guardianInvites.schoolId, school.id),
          eq(guardianInvites.id, id),
          isNull(guardianInvites.acceptedAt),
        ),
      )
      .limit(1);
    if (!invite || !(await mayInviteFor(tx, school.id, session, invite.studentId))) return;
    await tx.delete(guardianInvites).where(eq(guardianInvites.id, id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "parent.invite_cancelled",
      entity: "students",
      entityId: invite.studentId,
    });
  });
  revalidatePath("/classes", "layout");
  revalidatePath("/students", "layout");
}

/** Only the registrar unlinks a parent: it changes who may see the child. */
export async function unlinkParent(form: FormData) {
  const { school, session } = await requirePermission("students.manage");
  const studentId = String(form.get("studentId") ?? "");
  const userId = String(form.get("userId") ?? "");
  await withTenant(school.id, async (tx) => {
    await unlinkGuardian(tx, school.id, studentId, userId);
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "parent.unlinked",
      entity: "students",
      entityId: studentId,
      before: { guardian: userId },
    });
  });
  revalidatePath(`/students/${studentId}`);
}
