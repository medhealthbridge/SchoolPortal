"use server";

import { withTenant } from "@/db";
import { requireUser } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { issueReset, mayResetFor, OFFICE_HOURS } from "@/lib/password-reset";
import { schoolUrl } from "@/lib/school-url";

export type ResetLinkResult = { link?: string; error?: string } | null;

/**
 * The office makes a reset link for someone who cannot get one by email: a
 * student with no address, a parent who lost theirs, any account while the
 * school has no mail provider. It is shown once, to hand over in person or by
 * text; only its hash is stored.
 */
export async function issueResetLink(_prev: ResetLinkResult, form: FormData): Promise<ResetLinkResult> {
  const { school, session } = await requireUser();
  const userId = String(form.get("userId") ?? "");
  const token = await withTenant(school.id, async (tx) => {
    if (!(await mayResetFor(tx, school.id, session, userId))) return null;
    const t = await issueReset(tx, {
      schoolId: school.id,
      userId,
      hours: OFFICE_HOURS,
      createdByUserId: session.userId,
    });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "user.reset_link_issued",
      entity: "users",
      entityId: userId,
    });
    return t;
  });
  if (!token) return { error: "You cannot reset that account's password." };
  return { link: schoolUrl(school.subdomain, `/reset/${token}`) };
}
