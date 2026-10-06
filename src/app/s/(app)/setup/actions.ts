"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { guessGroup } from "@/modules/grades/deped";
import { schools } from "@/db/schema";
import {
  branches,
  invites,
  rooms,
  schoolYears,
  seatPlans,
  sections,
  subjects,
  userRoles,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { deliver } from "@/lib/messaging";
import { randomBytes } from "node:crypto";
import type { Role } from "@/lib/roles";
import { withPlatform } from "@/db";
import { checkImage, keyFromUrl, put, remove } from "@/lib/storage";
import { parseProfile } from "@/lib/profile";
import { standardNotice } from "@/lib/privacy";

type ActionResult = { ok?: string; error?: string; issues?: string[] } | null;

export async function createSchoolYear(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("sections.manage");
  const name = String(form.get("name") ?? "").trim();
  const startsOn = String(form.get("startsOn") ?? "");
  const endsOn = String(form.get("endsOn") ?? "");
  if (!name || !startsOn || !endsOn) return { error: "Fill in the year, start and end." };

  await withTenant(school.id, async (tx) => {
    await tx
      .update(schoolYears)
      .set({ isCurrent: false })
      .where(eq(schoolYears.schoolId, school.id));
    const [row] = await tx
      .insert(schoolYears)
      .values({ schoolId: school.id, name, startsOn, endsOn, isCurrent: true })
      .onConflictDoUpdate({
        target: [schoolYears.schoolId, schoolYears.name],
        set: { startsOn, endsOn, isCurrent: true },
      })
      .returning();
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "school_year.set_current",
      entity: "school_years",
      entityId: row.id,
      after: { name, startsOn, endsOn },
    });
  });

  revalidatePath("/setup");
  return { ok: `${name} is now the current school year.` };
}

export async function addSection(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("sections.manage");
  const level = String(form.get("level") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  if (!level || !name) return { error: "A section needs a level and a name." };

  const result = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    if (!year) return { error: "Set the current school year first." };

    const [mainBranch] = await tx
      .select()
      .from(branches)
      .where(eq(branches.schoolId, school.id))
      .limit(1);

    const [row] = await tx
      .insert(sections)
      .values({
        schoolId: school.id,
        branchId: mainBranch?.id ?? null,
        schoolYearId: year.id,
        level,
        name,
      })
      .onConflictDoNothing()
      .returning();
    if (row) {
      await audit(tx, {
        schoolId: school.id,
        actorUserId: session.userId,
        actorLabel: session.name,
        action: "section.created",
        entity: "sections",
        entityId: row.id,
        after: { level, name },
      });
    }
    return { ok: `${level} ${name} added.` };
  });

  revalidatePath("/setup");
  return result;
}

export async function addSubject(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school } = await requirePermission("sections.manage");
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const name = String(form.get("name") ?? "").trim();
  if (!code || !name) return { error: "A subject needs a code and a name." };
  await withTenant(school.id, (tx) =>
    tx.insert(subjects).values({ schoolId: school.id, code, name, gradingGroup: guessGroup(name) }).onConflictDoNothing(),
  );
  revalidatePath("/setup");
  return { ok: `${code} added.` };
}

export async function addRoom(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school } = await requirePermission("sections.manage");
  const name = String(form.get("name") ?? "").trim();
  const rowCount = Number(form.get("rows") ?? 5);
  const colCount = Number(form.get("cols") ?? 6);
  if (!name) return { error: "A room needs a name." };
  await withTenant(school.id, (tx) =>
    tx
      .insert(rooms)
      .values({ schoolId: school.id, name, rows: rowCount, cols: colCount })
      .onConflictDoNothing(),
  );
  revalidatePath("/setup");
  return { ok: `${name} added.` };
}

export async function saveSeatPlan(
  schoolIdIgnored: string,
  sectionId: string,
  roomId: string,
  layout: { studentId: string; row: number; col: number }[],
) {
  void schoolIdIgnored;
  const { school } = await requirePermission("timetable.manage");
  await withTenant(school.id, (tx) =>
    tx
      .insert(seatPlans)
      .values({ schoolId: school.id, sectionId, roomId, layout: layout as never })
      .onConflictDoUpdate({
        target: [seatPlans.sectionId, seatPlans.roomId],
        set: { layout: layout as never, updatedAt: new Date() },
      }),
  );
  revalidatePath("/setup");
  return { ok: "Seat plan saved." };
}

export async function inviteStaff(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("users.manage");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "") as Role;
  if (!email || !name || !role) return { error: "A name, an email and a role, please." };

  const token = randomBytes(24).toString("base64url");
  await withTenant(school.id, async (tx) => {
    await tx.insert(invites).values({ schoolId: school.id, email, name, role, token });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "staff.invited",
      after: { email, role },
    });
  });

  const root = process.env.ROOT_DOMAIN ?? "lvh.me:3000";
  const protocol = root.includes("lvh.me") || root.startsWith("localhost") ? "http" : "https";
  await deliver({
    schoolId: school.id,
    channel: "email",
    to: email,
    subject: `Join ${school.name} on SchoolPortal`,
    body: `${session.name} invited you as ${role}. Accept at ${protocol}://${school.subdomain}.${root}/invite/${token}`,
  });

  revalidatePath("/people");
  return {
    ok: `Invite created for ${email}. We email it if this site can send mail; if not, copy the link from “Invites not yet accepted” below and send it yourself.`,
  };
}

export async function acceptInvite(token: string, name: string, password: string) {
  const school = await (await import("@/lib/session")).currentSchool();
  if (!school) return { error: "Unknown school." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  return withTenant(school.id, async (tx) => {
    const [invite] = await tx
      .select()
      .from(invites)
      .where(and(eq(invites.schoolId, school.id), eq(invites.token, token)))
      .limit(1);
    if (!invite || invite.acceptedAt) return { error: "That invite is no longer valid." };

    // Someone who already has an account here (a parent who is also joining
    // as a teacher, say) keeps it and its password; the invite only adds the
    // role. The password typed here is not used for them, and saying "account
    // created" would send them to sign in with the wrong one.
    const [existing] = await tx
      .select()
      .from(users)
      .where(and(eq(users.schoolId, school.id), eq(users.email, invite.email)))
      .limit(1);

    const user =
      existing ??
      (
        await tx
          .insert(users)
          .values({
            schoolId: school.id,
            email: invite.email,
            name: name || invite.name,
            passwordHash: await hashPassword(password),
            status: "active",
          })
          .returning()
      )[0]!;

    const held = await tx
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));
    if (!held.some((h) => h.role === invite.role))
      await tx.insert(userRoles).values({ schoolId: school.id, userId: user.id, role: invite.role });
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: user.id,
      actorLabel: user.name,
      action: "staff.invite_accepted",
      after: { role: invite.role },
    });
    return {
      ok: existing
        ? `You already have an account as ${existing.email}; the new role is added to it. Sign in with your existing password.`
        : "Account created.",
      userId: user.id,
    };
  });
}


/**
 * The school's logo. It appears on the badge in every screen's corner, so it
 * is the one upload a school makes before anything else.
 *
 * `schools` carries no school_id — it IS the school — so it has no row-level
 * security and is written through withPlatform. The row is pinned to this
 * school's id, which the guard already resolved from the subdomain.
 */
export async function saveLogo(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("school.manage");
  const file = form.get("logo");

  if (form.get("remove") === "yes") {
    const old = keyFromUrl(school.logoUrl);
    await withPlatform((tx) =>
      tx.update(schools).set({ logoUrl: null }).where(eq(schools.id, school.id)),
    );
    if (old) await remove(old);
    revalidatePath("/setup");
    return { ok: "Logo removed. The badge shows the school's initials again." };
  }

  if (!(file instanceof File)) return { error: "Choose an image." };

  const checked = await checkImage(file);
  if (!checked.ok) return { error: checked.error };

  let stored;
  try {
    stored = await put(`schools/${school.id}`, checked.bytes, checked.type, checked.ext);
  } catch (err) {
    console.error(err);
    return { error: "The file could not be stored. Try again in a moment." };
  }

  const previous = keyFromUrl(school.logoUrl);
  await withPlatform(async (tx) => {
    await tx.update(schools).set({ logoUrl: stored.url }).where(eq(schools.id, school.id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "school.logo_changed",
      entity: "schools",
      entityId: school.id,
    });
  });
  // Only once the new one is saved: a failed write must not leave the school
  // with no logo at all.
  if (previous) await remove(previous);

  revalidatePath("/setup");
  return { ok: "Logo saved. It shows in the corner of every screen." };
}

/**
 * The school's name, address, phone and brand colour.
 *
 * The subdomain is deliberately not editable here: it is the school's
 * address on the internet, every link it has ever sent points at it, and
 * changing it is a platform-admin job rather than a form.
 *
 * As with the logo, `schools` has no school_id and so no row-level security;
 * the update is pinned to the id the guard resolved from the subdomain.
 */
export async function saveProfile(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("school.manage");

  const parsed = parseProfile({
    name: form.get("name"),
    address: form.get("address"),
    phone: form.get("phone"),
    primaryColor: form.get("primaryColor"),
  });
  if (!parsed.ok) return { error: parsed.error };
  const next = parsed.value;

  const before = {
    name: school.name,
    address: school.address,
    phone: school.phone,
    primaryColor: school.primaryColor,
  };
  if (JSON.stringify(before) === JSON.stringify(next)) {
    return { ok: "Nothing changed." };
  }

  await withPlatform(async (tx) => {
    await tx.update(schools).set(next).where(eq(schools.id, school.id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "school.profile_changed",
      entity: "schools",
      entityId: school.id,
      before,
      after: next,
    });
  });

  revalidatePath("/setup");
  return { ok: "Profile saved. The name and colour show on every screen." };
}

/** The school's privacy notice and its Data Protection Officer. */
export async function savePrivacy(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("school.manage");
  const officer = String(form.get("privacyOfficer") ?? "").trim().slice(0, 200) || null;
  const text = String(form.get("privacyNotice") ?? "").replace(/\r\n/g, "\n").trim();
  if (text.length < 200) return { error: "The notice is too short to tell people what the school keeps and why." };
  if (text.length > 8000) return { error: "Keep the notice under 8,000 characters." };
  // The standard wording is kept as "none", so it follows a change of school name.
  const notice = text === standardNotice(school).trim() ? null : text;
  const askAgain = form.get("askAgain") === "1";
  const version = askAgain ? school.privacyNoticeVersion + 1 : school.privacyNoticeVersion;

  await withPlatform(async (tx) => {
    await tx
      .update(schools)
      .set({ privacyNotice: notice, privacyOfficer: officer, privacyNoticeVersion: version })
      .where(eq(schools.id, school.id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "school.privacy_notice_changed",
      entity: "schools",
      entityId: school.id,
      after: { version, custom: notice !== null, officer },
    });
  });
  // Whoever publishes the new version has read it: they are not stopped by it.
  if (askAgain)
    await withTenant(school.id, (tx) =>
      tx
        .update(users)
        .set({ privacyConsentAt: new Date(), privacyConsentVersion: version })
        .where(eq(users.id, session.userId)),
    );
  revalidatePath("/setup");
  return {
    ok: askAgain
      ? `Saved. Everyone will be asked to accept version ${version} on their next visit.`
      : "Saved. People who already accepted are not asked again.",
  };
}
