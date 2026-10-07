"use server";

import { goTo, type Navigation } from "@/lib/nav";
import { createAdminSession, destroySession, ADMIN_COOKIE } from "@/lib/session";
import { audit } from "@/lib/audit";
import { withPlatform } from "@/db";
import { attempt, clearAttempts, LOGIN, retryMessage } from "@/lib/throttle";
import { clientIp } from "@/lib/request";
import { checkAdminSignIn } from "@/lib/admin-auth";

export type AdminSignInResult = {
  error?: string;
  /** Set on a first sign-in: the key to put in an authenticator app. */
  enroll?: { secret: string; uri: string };
} & Partial<Navigation>;

export async function adminSignIn(
  _prev: AdminSignInResult | null,
  form: FormData,
): Promise<AdminSignInResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "");
  const enrolling = String(form.get("enrolling") ?? "");

  // This account reaches every school, so it gets the tightest budget in the
  // app — six tries, counted against the address as well as the email.
  const budget = { max: 6, windowMs: LOGIN.windowMs };
  const who = `admin:${email}`;
  for (const key of [who, `admin-ip:${await clientIp()}`]) {
    const { allowed, retryInSeconds } = await attempt(key, budget);
    if (!allowed) return { error: retryMessage(retryInSeconds) };
  }

  const outcome = await checkAdminSignIn({ email, password, code, enrolling });
  if (outcome.kind === "error") return { error: outcome.error };
  if (outcome.kind === "enroll") {
    return { enroll: { secret: outcome.secret, uri: outcome.uri }, error: outcome.error };
  }

  await clearAttempts(who);
  await withPlatform((tx) =>
    audit(tx, {
      schoolId: null,
      actorLabel: `${outcome.name} (platform)`,
      action: "platform_admin.signed_in",
    }),
  );
  await createAdminSession(outcome.adminId);
  return goTo("/");
}

export async function adminSignOut() {
  await destroySession(ADMIN_COOKIE);
  return goTo("/login");
}
