"use server";

import { goTo, type Navigation } from "@/lib/nav";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformAdmins } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { createAdminSession, destroySession, ADMIN_COOKIE } from "@/lib/session";
import { audit } from "@/lib/audit";
import { withPlatform } from "@/db";
import { attempt, clearAttempts, LOGIN, retryMessage } from "@/lib/throttle";
import { clientIp } from "@/lib/request";

export type AdminSignInResult = { error?: string } & Partial<Navigation>;

export async function adminSignIn(
  _prev: AdminSignInResult | null,
  form: FormData,
): Promise<AdminSignInResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "");

  // This account reaches every school, so it gets the tightest budget in the
  // app — six tries, counted against the address as well as the email.
  const budget = { max: 6, windowMs: LOGIN.windowMs };
  const who = `admin:${email}`;
  for (const key of [who, `admin-ip:${await clientIp()}`]) {
    const { allowed, retryInSeconds } = await attempt(key, budget);
    if (!allowed) return { error: retryMessage(retryInSeconds) };
  }

  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.email, email))
    .limit(1);

  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    return { error: "That sign-in did not match." };
  }
  // The platform admin reaches every school, so the second factor is required,
  // not optional.
  if (!admin.totpSecret || !verifyTotp(admin.totpSecret, code)) {
    return { error: "That second-factor code is wrong." };
  }

  await clearAttempts(who);
  await withPlatform((tx) =>
    audit(tx, {
      schoolId: null,
      actorLabel: `${admin.name} (platform)`,
      action: "platform_admin.signed_in",
    }),
  );
  await createAdminSession(admin.id);
  return goTo("/");
}

export async function adminSignOut() {
  await destroySession(ADMIN_COOKIE);
  return goTo("/login");
}
