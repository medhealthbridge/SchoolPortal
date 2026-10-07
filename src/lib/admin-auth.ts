import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { platformAdmins } from "@/db/schema";
import { verifyPassword } from "./password";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "./totp";

/**
 * Signing in as the platform admin: a password, then a code from an
 * authenticator app. This account reaches every school, so the second factor
 * is not optional.
 *
 * A fresh deployment cannot have an authenticator yet, and the alternative —
 * printing a key into a build log or a chat — leaves the second factor
 * sitting next to the password it is meant to be independent of. So the first
 * sign-in enrols one: the password is checked, the app shows a key, and the
 * admin proves they have it by typing the code it produces. Only then is it
 * saved, and only if none was saved in the meantime.
 */
export type AdminSignIn =
  | { kind: "ok"; adminId: string; name: string }
  | { kind: "enroll"; secret: string; uri: string; error?: string }
  | { kind: "error"; error: string };

/** generateTotpSecret(20) is exactly 32 base32 characters. */
const SECRET_SHAPE = /^[A-Z2-7]{32}$/;

export async function checkAdminSignIn(input: {
  email: string;
  password: string;
  code: string;
  /** The key the page showed on the previous step, handed back by the form. */
  enrolling?: string;
}): Promise<AdminSignIn> {
  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.email, input.email))
    .limit(1);

  if (!admin || !(await verifyPassword(input.password, admin.passwordHash))) {
    return { kind: "error", error: "That sign-in did not match." };
  }

  const code = input.code.trim();

  if (admin.totpSecret) {
    if (!code) return { kind: "error", error: "Enter the six-digit code from your authenticator app." };
    if (!verifyTotp(admin.totpSecret, code)) {
      return { kind: "error", error: "That second-factor code is wrong." };
    }
    return { kind: "ok", adminId: admin.id, name: admin.name };
  }

  // Not enrolled yet. A key that is not the shape we generate is ignored and
  // replaced, so the form cannot be used to install a weak one.
  const proposed = SECRET_SHAPE.test(input.enrolling ?? "") ? input.enrolling! : null;
  const secret = proposed ?? generateTotpSecret();
  const uri = otpauthUrl(secret, admin.email);

  if (!proposed || !code) return { kind: "enroll", secret, uri };

  if (!verifyTotp(secret, code)) {
    return {
      kind: "enroll",
      secret,
      uri,
      error: "That code is not right. Check the key in your app, then enter its next code.",
    };
  }

  // Compare-and-set: if two sign-ins race, the second must not replace the
  // first one's key.
  const saved = await db
    .update(platformAdmins)
    .set({ totpSecret: secret })
    .where(and(eq(platformAdmins.id, admin.id), isNull(platformAdmins.totpSecret)))
    .returning({ id: platformAdmins.id });
  if (saved.length === 0) {
    return {
      kind: "error",
      error: "An authenticator was set up a moment ago. Sign in again with its code.",
    };
  }
  return { kind: "ok", adminId: admin.id, name: admin.name };
}
