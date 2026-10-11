"use server";

import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { goTo, type Navigation } from "@/lib/nav";
import { currentSchool, getSchoolSession } from "@/lib/session";

export async function acceptPrivacy(): Promise<Navigation | { error: string }> {
  const school = await currentSchool();
  const session = await getSchoolSession();
  if (!school || !session || session.schoolId !== school.id) return goTo("/login");
  await withTenant(school.id, async (tx) => {
    await tx
      .update(users)
      .set({ privacyConsentAt: new Date(), privacyConsentVersion: school.privacyNoticeVersion })
      .where(eq(users.id, session.userId));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "privacy.consented",
      entity: "users",
      entityId: session.userId,
      after: { version: school.privacyNoticeVersion },
    });
  });
  return goTo("/");
}
