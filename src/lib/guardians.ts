/**
 * Parents and the children linked to them.
 *
 * A teacher (or the registrar) invites a parent for one child. The parent
 * opens the link and either makes an account or, if they already have one,
 * proves it with their password; either way the child is linked. A second
 * child's invite to the same email lands on the same account, which is how a
 * parent comes to see several children.
 */
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { guardianInvites, studentGuardians, students, userRoles, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";
import { permissionsFor } from "./roles";
import { audit } from "./audit";
import { sectionOfStudent, sectionsOfTeacher } from "./schedule";
import type { SchoolSession } from "./session";

export const INVITE_DAYS = 14;
export const RELATIONSHIPS = ["mother", "father", "guardian", "grandparent", "other"] as const;

/**
 * The office (registrar, principal, admin) may invite for any student. A
 * teacher may invite only for students in a section they teach or advise.
 */
export async function mayInviteFor(
  tx: Tx,
  schoolId: string,
  session: Pick<SchoolSession, "userId" | "roles">,
  studentId: string,
) {
  const perms = permissionsFor(session.roles);
  if (!perms.has("guardians.invite")) return false;
  if (perms.has("students.manage") || perms.has("staff.manage")) return true;
  const section = await sectionOfStudent(tx, schoolId, studentId);
  if (!section) return false;
  const mine = await sectionsOfTeacher(tx, schoolId, session.userId);
  return mine.some((s) => s.id === section.id);
}

export async function linkGuardian(
  tx: Tx,
  schoolId: string,
  studentId: string,
  userId: string,
  relationship = "parent",
) {
  await tx
    .insert(studentGuardians)
    .values({ schoolId, studentId, guardianUserId: userId, relationship })
    .onConflictDoNothing();
  const held = await tx
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  if (!held.some((h) => h.role === "parent"))
    await tx.insert(userRoles).values({ schoolId, userId, role: "parent" });
}

export type InviteInput = {
  schoolId: string;
  studentId: string;
  name: string;
  email: string;
  phone?: string | null;
  relationship: string;
  invitedByUserId: string;
  invitedByName: string;
};

export async function createGuardianInvite(
  tx: Tx,
  input: InviteInput,
): Promise<{ token: string; reused: boolean } | { error: string }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;
  if (name.length < 2) return { error: "Enter the parent's name." };
  if (!z.string().email().safeParse(email).success)
    return { error: "Enter the parent's email address. It is how they will sign in." };
  if (phone && !/^[+()\d][\d\s()+-]{6,19}$/.test(phone)) return { error: "Check the phone number." };
  const relationship = (RELATIONSHIPS as readonly string[]).includes(input.relationship)
    ? input.relationship
    : "guardian";

  const [student] = await tx
    .select()
    .from(students)
    .where(and(eq(students.schoolId, input.schoolId), eq(students.id, input.studentId)))
    .limit(1);
  if (!student || student.archivedAt) return { error: "That student is not enrolled." };

  const [linked] = await tx
    .select({ id: studentGuardians.id })
    .from(studentGuardians)
    .innerJoin(users, eq(users.id, studentGuardians.guardianUserId))
    .where(
      and(
        eq(studentGuardians.schoolId, input.schoolId),
        eq(studentGuardians.studentId, input.studentId),
        eq(users.email, email),
      ),
    )
    .limit(1);
  if (linked) return { error: `${email} is already linked to ${student.firstName}.` };

  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  const [open] = await tx
    .select()
    .from(guardianInvites)
    .where(
      and(
        eq(guardianInvites.schoolId, input.schoolId),
        eq(guardianInvites.studentId, input.studentId),
        eq(guardianInvites.email, email),
        isNull(guardianInvites.acceptedAt),
      ),
    )
    .limit(1);
  if (open) {
    await tx
      .update(guardianInvites)
      .set({ expiresAt, name, phone, relationship })
      .where(eq(guardianInvites.id, open.id));
    return { token: open.token, reused: true };
  }

  const token = randomBytes(24).toString("base64url");
  await tx.insert(guardianInvites).values({
    schoolId: input.schoolId,
    studentId: input.studentId,
    email,
    phone,
    name,
    relationship,
    token,
    invitedByUserId: input.invitedByUserId,
    expiresAt,
  });
  await audit(tx, {
    schoolId: input.schoolId,
    actorUserId: input.invitedByUserId,
    actorLabel: input.invitedByName,
    action: "parent.invited",
    entity: "students",
    entityId: input.studentId,
    after: { email, relationship },
  });
  return { token, reused: false };
}

/** An invite that can still be used, with the child it is for. */
export async function openInvite(tx: Tx, schoolId: string, token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const [row] = await tx
    .select({ invite: guardianInvites, student: students })
    .from(guardianInvites)
    .innerJoin(students, eq(students.id, guardianInvites.studentId))
    .where(
      and(
        eq(guardianInvites.schoolId, schoolId),
        eq(guardianInvites.token, token),
        isNull(guardianInvites.acceptedAt),
        gt(guardianInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [account] = await tx
    .select({ id: users.id, name: users.name, status: users.status })
    .from(users)
    .where(and(eq(users.schoolId, schoolId), eq(users.email, row.invite.email)))
    .limit(1);
  return { ...row, account: account ?? null };
}

/**
 * Accepts an invite. A new parent sets a name and password; an existing
 * account must give its own password, so holding the link is never enough to
 * get into somebody else's account.
 */
export async function acceptGuardianInvite(
  tx: Tx,
  input: { schoolId: string; token: string; name: string; password: string },
): Promise<{ userId: string; studentName: string } | { error: string }> {
  const found = await openInvite(tx, input.schoolId, input.token);
  if (!found) return { error: "This invite has expired or was already used. Ask the school for a new one." };
  const { invite, student, account } = found;

  let userId: string;
  if (account) {
    const [full] = await tx.select().from(users).where(eq(users.id, account.id)).limit(1);
    if (!full || full.status !== "active" || !(await verifyPassword(input.password, full.passwordHash)))
      return { error: "That password does not match the account for this email." };
    userId = full.id;
  } else {
    if (input.password.length < 8) return { error: "Use a password of at least 8 characters." };
    const name = input.name.trim() || invite.name;
    const [created] = await tx
      .insert(users)
      .values({
        schoolId: input.schoolId,
        email: invite.email,
        phone: invite.phone,
        name,
        passwordHash: await hashPassword(input.password),
        status: "active",
      })
      .returning();
    userId = created!.id;
  }

  await linkGuardian(tx, input.schoolId, student.id, userId, invite.relationship);
  await tx
    .update(guardianInvites)
    .set({ acceptedAt: new Date(), acceptedByUserId: userId })
    .where(eq(guardianInvites.id, invite.id));
  await audit(tx, {
    schoolId: input.schoolId,
    actorUserId: userId,
    actorLabel: account?.name ?? input.name ?? invite.name,
    action: "parent.linked_child",
    entity: "students",
    entityId: student.id,
    after: { via: "invite", relationship: invite.relationship },
  });
  return { userId, studentName: `${student.firstName} ${student.lastName}` };
}

/** Parents linked to a student, and invites still waiting. */
export async function guardiansOf(tx: Tx, schoolId: string, studentId: string) {
  const linked = await tx
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      relationship: studentGuardians.relationship,
      status: users.status,
    })
    .from(studentGuardians)
    .innerJoin(users, eq(users.id, studentGuardians.guardianUserId))
    .where(and(eq(studentGuardians.schoolId, schoolId), eq(studentGuardians.studentId, studentId)));
  const pending = await tx
    .select()
    .from(guardianInvites)
    .where(
      and(
        eq(guardianInvites.schoolId, schoolId),
        eq(guardianInvites.studentId, studentId),
        isNull(guardianInvites.acceptedAt),
        gt(guardianInvites.expiresAt, new Date()),
      ),
    );
  return { linked, pending };
}

export async function unlinkGuardian(
  tx: Tx,
  schoolId: string,
  studentId: string,
  guardianUserId: string,
) {
  await tx
    .delete(studentGuardians)
    .where(
      and(
        eq(studentGuardians.schoolId, schoolId),
        eq(studentGuardians.studentId, studentId),
        eq(studentGuardians.guardianUserId, guardianUserId),
      ),
    );
}
