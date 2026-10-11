"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { guessGroup } from "@/modules/grades/deped";
import { schools } from "@/db/schema";
import {
  announcements,
  assessments,
  branches,
  enrollments,
  invites,
  learningMaterials,
  rooms,
  schoolYears,
  seatPlans,
  sections,
  subjects,
  timetableSlots,
  userRoles,
  users,
} from "@/db/schema";

/** 0 → A, 25 → Z, 26 → AA: section letters that never run out. */
function letters(n: number): string {
  let s = "";
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
import { requirePermission } from "@/lib/guard";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { deliver } from "@/lib/messaging";
import { emailTemplates } from "@/lib/email-template";
import { randomBytes } from "node:crypto";
import { ROLE_LABELS, type Role } from "@/lib/roles";
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
  let name = String(form.get("name") ?? "").trim();
  if (!level) return { error: "A section needs a level." };

  const result = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    if (!year) return { error: "Set the current school year first." };

    const existing = await tx
      .select({ name: sections.name })
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.schoolYearId, year.id), eq(sections.level, level)));
    const taken = new Set(existing.map((s) => s.name.toLowerCase()));
    if (!name) {
      let n = 0;
      while (taken.has(`section ${letters(n)}`.toLowerCase())) n++;
      name = `Section ${letters(n)}`;
    } else if (taken.has(name.toLowerCase())) {
      return { error: `${level} already has a section called ${name}.` };
    }

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
    if (!row) return { error: `${level} already has a section called ${name}.` };
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "section.created",
      entity: "sections",
      entityId: row.id,
      after: { level, name },
    });
    return { ok: `${level} ${name} added.` };
  });

  revalidatePath("/setup");
  return result;
}

export async function updateSection(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("sections.manage");
  const id = String(form.get("id") ?? "");
  const level = String(form.get("level") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  if (!id || !level) return { error: "A section needs a level." };

  const result = await withTenant(school.id, async (tx): Promise<ActionResult> => {
    const [row] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.id, id)))
      .limit(1);
    if (!row) return { error: "That section is no longer on file." };
    const next = { level, name: name || row.name };
    const [twin] = await tx
      .select({ id: sections.id })
      .from(sections)
      .where(
        and(
          eq(sections.schoolYearId, row.schoolYearId),
          eq(sections.level, next.level),
          eq(sections.name, next.name),
          ne(sections.id, id),
        ),
      )
      .limit(1);
    if (twin) return { error: `${next.level} already has a section called ${next.name}.` };
    await tx.update(sections).set(next).where(eq(sections.id, id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "section.updated",
      entity: "sections",
      entityId: id,
      before: { level: row.level, name: row.name },
      after: next,
    });
    return { ok: `${next.level} ${next.name} saved.` };
  });
  revalidatePath("/setup");
  return result;
}

/**
 * Deleting a section cascades to its enrolments, schedule, attendance,
 * assessments, seat plans, announcements and materials, so it is refused once
 * any of those exist. Only a section added by mistake can go.
 */
export async function deleteSection(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("sections.manage");
  const id = String(form.get("id") ?? "");
  const result = await withTenant(school.id, async (tx): Promise<ActionResult> => {
    const [row] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.id, id)))
      .limit(1);
    if (!row) return { error: "That section is no longer on file." };
    const used = await Promise.all(
      [enrollments, timetableSlots, assessments, seatPlans, announcements, learningMaterials].map(
        async (t) => {
          const [r] = await tx.select({ n: count() }).from(t).where(eq(t.sectionId, id));
          return Number(r?.n ?? 0);
        },
      ),
    );
    if (used.some((n) => n > 0))
      return {
        error: `${row.level} ${row.name} has students, classes or records, so it cannot be deleted. Rename it instead.`,
      };
    await tx.delete(sections).where(eq(sections.id, id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "section.deleted",
      entity: "sections",
      entityId: id,
      before: { level: row.level, name: row.name },
    });
    return { ok: `${row.level} ${row.name} deleted.` };
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
  const rowCount = Math.min(12, Math.max(1, Number(form.get("rows") ?? 5)));
  const colCount = Math.min(12, Math.max(1, Number(form.get("cols") ?? 6)));
  if (!name) return { error: "A room needs a name." };
  const inserted = await withTenant(school.id, (tx) =>
    tx
      .insert(rooms)
      .values({ schoolId: school.id, name, rows: rowCount, cols: colCount })
      .onConflictDoNothing()
      .returning({ id: rooms.id }),
  );
  if (inserted.length === 0) return { error: `There is already a room called ${name}.` };
  revalidatePath("/setup");
  return { ok: `${name} added (${rowCount}×${colCount} = ${rowCount * colCount} seats).` };
}

export async function updateRoom(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("sections.manage");
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const rowCount = Math.min(12, Math.max(1, Number(form.get("rows") ?? 5)));
  const colCount = Math.min(12, Math.max(1, Number(form.get("cols") ?? 6)));
  if (!id || !name) return { error: "A room needs a name." };

  const result = await withTenant(school.id, async (tx): Promise<ActionResult> => {
    const [row] = await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.schoolId, school.id), eq(rooms.id, id)))
      .limit(1);
    if (!row) return { error: "That room is no longer on file." };
    const [twin] = await tx
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.schoolId, school.id), eq(rooms.name, name), ne(rooms.id, id)))
      .limit(1);
    if (twin) return { error: `There is already a room called ${name}.` };
    await tx.update(rooms).set({ name, rows: rowCount, cols: colCount }).where(eq(rooms.id, id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "room.updated",
      entity: "rooms",
      entityId: id,
      before: { name: row.name, rows: row.rows, cols: row.cols },
      after: { name, rows: rowCount, cols: colCount },
    });
    return { ok: `${name} saved (${rowCount}×${colCount} = ${rowCount * colCount} seats).` };
  });
  revalidatePath("/setup");
  return result;
}

/** A room in the schedule or with a seat plan is refused: deleting would drop both. */
export async function deleteRoom(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("sections.manage");
  const id = String(form.get("id") ?? "");
  const result = await withTenant(school.id, async (tx): Promise<ActionResult> => {
    const [row] = await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.schoolId, school.id), eq(rooms.id, id)))
      .limit(1);
    if (!row) return { error: "That room is no longer on file." };
    const used = await Promise.all(
      [timetableSlots, seatPlans].map(async (t) => {
        const [r] = await tx.select({ n: count() }).from(t).where(eq(t.roomId, id));
        return Number(r?.n ?? 0);
      }),
    );
    if (used.some((n) => n > 0))
      return {
        error: `${row.name} is in the class schedule or has a seat plan, so it cannot be deleted. Rename it instead.`,
      };
    await tx.delete(rooms).where(eq(rooms.id, id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "room.deleted",
      entity: "rooms",
      entityId: id,
      before: { name: row.name },
    });
    return { ok: `${row.name} deleted.` };
  });
  revalidatePath("/setup");
  return result;
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
  if (!(role in ROLE_LABELS)) return { error: "Choose one of the school's roles." };

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
  const inviteUrl = `${protocol}://${school.subdomain}.${root}/invite/${token}`;
  await deliver({
    schoolId: school.id,
    channel: "email",
    to: email,
    subject: `Join ${school.name} on SchoolPortal`,
    body: `${session.name} invited you as ${role}. Accept at ${inviteUrl}`,
    html: emailTemplates.staffInvite({ name: school.name }, session.name, role, inviteUrl),
  });

  revalidatePath("/people");
  return {
    ok: `Invite created for ${email}. We email it if this site can send mail; if not, copy the link from “Invites not yet accepted” below and send it yourself.`,
  };
}

/**
 * `email` lets the teacher put their own address in place of the one the
 * school guessed from their name, which is usually not a real mailbox: it is
 * their sign-in, and the only way a password reset can ever reach them.
 */
export async function acceptInvite(token: string, name: string, password: string, email?: string) {
  const school = await (await import("@/lib/session")).currentSchool();
  if (!school) return { error: "Unknown school." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  const chosen = (email ?? "").trim().toLowerCase();
  if (chosen && !z.string().email().safeParse(chosen).success)
    return { error: "Check the email address." };

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
    // created" would send them to sign in with the wrong one. This is keyed on
    // the invited address, which the school chose, never on a typed one.
    const [existing] = await tx
      .select()
      .from(users)
      .where(and(eq(users.schoolId, school.id), eq(users.email, invite.email)))
      .limit(1);

    // A typed address that is someone else's would take over their sign-in.
    const signIn = chosen || invite.email;
    if (!existing && signIn !== invite.email) {
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.schoolId, school.id), eq(users.email, signIn)))
        .limit(1);
      if (taken)
        return { error: "That email already signs in here. Use another, or ask your school office." };
    }

    const user =
      existing ??
      (
        await tx
          .insert(users)
          .values({
            schoolId: school.id,
            email: signIn,
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
        : `Account created. Sign in with ${signIn}.`,
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
