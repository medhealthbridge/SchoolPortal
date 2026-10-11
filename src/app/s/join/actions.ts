"use server";

import { withTenant } from "@/db";
import { acceptGuardianInvite } from "@/lib/guardians";
import { goTo, type Navigation } from "@/lib/nav";
import { createSchoolSession, currentSchool } from "@/lib/session";
import { attempt, retryMessage, SIGNUP } from "@/lib/throttle";
import { clientIp } from "@/lib/request";

type Result = ({ error?: string } & Partial<Navigation>) | null;

export async function acceptParentInvite(_prev: Result, form: FormData): Promise<Result> {
  const school = await currentSchool();
  if (!school) return { error: "Unknown school." };
  if (school.status === "suspended") return { error: "This school is on hold." };

  const limit = await attempt(`join-parent:${school.id}:${await clientIp()}`, SIGNUP);
  if (!limit.allowed) return { error: retryMessage(limit.retryInSeconds) };

  const outcome = await withTenant(school.id, (tx) =>
    acceptGuardianInvite(tx, {
      schoolId: school.id,
      token: String(form.get("token") ?? ""),
      name: String(form.get("name") ?? ""),
      password: String(form.get("password") ?? ""),
    }),
  );
  if ("error" in outcome) return { error: outcome.error };
  await createSchoolSession(outcome.userId, school.id);
  return goTo("/");
}
