/**
 * One-time links to set a new password.
 *
 * Someone who forgot theirs asks for a link by email. Where the school cannot
 * send email yet, or the person has none (a young student), the office makes
 * the link and hands it over. Either way the link works once, expires, and
 * signs out every device the account was signed in on.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { passwordResets, students, userRoles, users } from "@/db/schema";
import { hashPassword } from "./password";
import { permissionsFor } from "./roles";
import type { SchoolSession } from "./session";

export const SELF_HOURS = 1;
export const OFFICE_HOURS = 72;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueReset(
  tx: Tx,
  input: { schoolId: string; userId: string; hours: number; createdByUserId?: string },
) {
  const token = randomBytes(24).toString("base64url");
  await tx.insert(passwordResets).values({
    schoolId: input.schoolId,
    userId: input.userId,
    tokenHash: hash(token),
    createdByUserId: input.createdByUserId ?? null,
    expiresAt: new Date(Date.now() + input.hours * 3_600_000),
  });
  return token;
}

export async function openReset(tx: Tx, schoolId: string, token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const [row] = await tx
    .select({ reset: passwordResets, name: users.name, email: users.email, status: users.status })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(
      and(
        eq(passwordResets.schoolId, schoolId),
        eq(passwordResets.tokenHash, hash(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row || row.status === "disabled") return null;
  return row;
}

/** Sets the password and spends the link, and any other open link for that account. */
export async function useReset(tx: Tx, schoolId: string, token: string, password: string) {
  if (password.length < 8) return { error: "Use a password of at least 8 characters." } as const;
  const found = await openReset(tx, schoolId, token);
  if (!found) return { error: "This link has expired or was already used. Ask for a new one." } as const;
  const userId = found.reset.userId;
  await tx
    .update(users)
    .set({ passwordHash: await hashPassword(password), status: "active" })
    .where(eq(users.id, userId));
  await tx
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
  return { userId } as const;
}

/**
 * Whose password the office may reset. The school admin: anyone but
 * themselves (they use the email link). The registrar and the principal:
 * teaching accounts, and students and parents. Nobody resets an account that
 * can reach more than they can.
 */
export async function mayResetFor(
  tx: Tx,
  schoolId: string,
  actor: Pick<SchoolSession, "userId" | "roles">,
  targetUserId: string,
) {
  if (actor.userId === targetUserId) return false;
  const perms = permissionsFor(actor.roles);
  const held = (
    await tx
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.schoolId, schoolId), eq(userRoles.userId, targetUserId)))
  ).map((r) => r.role as string);
  if (held.length === 0) return false;
  if (perms.has("users.manage")) return true;

  const allowed = new Set<string>();
  if (perms.has("staff.manage")) ["teacher", "adviser"].forEach((r) => allowed.add(r));
  if (perms.has("students.manage")) ["student", "parent"].forEach((r) => allowed.add(r));
  return held.every((r) => allowed.has(r));
}

/** The account to send a link to, from what a person types on "Forgot password". */
export async function accountFor(tx: Tx, schoolId: string, identifier: string) {
  const value = identifier.trim();
  if (!value) return null;
  if (value.includes("@")) {
    const [u] = await tx
      .select()
      .from(users)
      .where(and(eq(users.schoolId, schoolId), eq(users.email, value.toLowerCase())))
      .limit(1);
    return u ?? null;
  }
  const [row] = await tx
    .select({ user: users })
    .from(students)
    .innerJoin(users, eq(users.id, students.claimedByUserId))
    .where(and(eq(students.schoolId, schoolId), eq(students.studentNumber, value)))
    .limit(1);
  return row?.user ?? null;
}
