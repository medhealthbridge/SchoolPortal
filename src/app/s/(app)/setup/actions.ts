"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schools } from "@/db/schema";
import {
  branches,
  enrollments,
  invites,
  rooms,
  schoolYears,
  seatPlans,
  sections,
  students,
  subjects,
  timetableSlots,
  userRoles,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { activationCode, hashPassword } from "@/lib/password";
import { audit, emit } from "@/lib/audit";
import { readSheet } from "@/lib/csv";
import { deliver } from "@/lib/messaging";
import { randomBytes } from "node:crypto";
import type { Role } from "@/lib/roles";
import { withPlatform } from "@/db";
import { checkImage, keyFromUrl, put, remove } from "@/lib/storage";
import { parseProfile } from "@/lib/profile";

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
    tx.insert(subjects).values({ schoolId: school.id, code, name }).onConflictDoNothing(),
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

export async function addTimetableSlot(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const { school, session } = await requirePermission("timetable.manage");
  const teacherUserId = String(form.get("teacherUserId") ?? "");
  const subjectId = String(form.get("subjectId") ?? "");
  const sectionId = String(form.get("sectionId") ?? "");
  const roomId = String(form.get("roomId") ?? "") || null;
  const weekday = Number(form.get("weekday") ?? 1);
  const startsAt = String(form.get("startsAt") ?? "");
  const endsAt = String(form.get("endsAt") ?? "");
  if (!teacherUserId || !subjectId || !sectionId || !startsAt || !endsAt)
    return { error: "Pick a teacher, subject, section and time." };
  if (endsAt <= startsAt) return { error: "The class has to end after it starts." };

  const result = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    if (!year) return { error: "Set the current school year first." };

    // A teacher cannot be in two rooms at once.
    const clashes = await tx
      .select({ id: timetableSlots.id, startsAt: timetableSlots.startsAt, endsAt: timetableSlots.endsAt })
      .from(timetableSlots)
      .where(
        and(
          eq(timetableSlots.schoolId, school.id),
          eq(timetableSlots.teacherUserId, teacherUserId),
          eq(timetableSlots.weekday, weekday),
        ),
      );
    if (clashes.some((c) => startsAt < c.endsAt && endsAt > c.startsAt))
      return { error: "That teacher already has a class at this time." };

    const [row] = await tx
      .insert(timetableSlots)
      .values({
        schoolId: school.id,
        schoolYearId: year.id,
        teacherUserId,
        subjectId,
        sectionId,
        roomId,
        weekday,
        startsAt,
        endsAt,
      })
      .returning();
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "timetable.slot_added",
      entity: "timetable_slots",
      entityId: row.id,
      after: { weekday, startsAt, endsAt },
    });
    return { ok: "Class added to the timetable." };
  });

  revalidatePath("/setup");
  return result;
}

/** Seat plans are saved per room and section, not per teacher. */
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

export async function importStudents(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { school, session } = await requirePermission("students.manage");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };

  const text = await file.text();
  const { records, issues } = readSheet(text, ["student_number", "first_name", "last_name"]);
  const problems = issues.map((i) => `Line ${i.line}: ${i.message}`);

  const seen = new Set<string>();
  for (const r of records) {
    const line = r.__line;
    if (!r.student_number) problems.push(`Line ${line}: missing student_number.`);
    if (!r.first_name || !r.last_name) problems.push(`Line ${line}: missing a name.`);
    if (r.student_number && seen.has(r.student_number))
      problems.push(`Line ${line}: student_number ${r.student_number} appears twice.`);
    if (r.student_number) seen.add(r.student_number);
  }

  // "Errors are shown before anything is saved."
  if (problems.length > 0) return { error: "Nothing was saved.", issues: problems.slice(0, 25) };

  const inserted = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    const sectionRows = await tx
      .select()
      .from(sections)
      .where(eq(sections.schoolId, school.id));
    const sectionByName = new Map(
      sectionRows.map((s) => [`${s.level} ${s.name}`.toLowerCase(), s]),
    );

    let count = 0;
    for (const r of records) {
      const [student] = await tx
        .insert(students)
        .values({
          schoolId: school.id,
          studentNumber: r.student_number,
          firstName: r.first_name,
          lastName: r.last_name,
          activationCode: activationCode(),
          parentCode: activationCode(),
        })
        .onConflictDoNothing()
        .returning();
      if (!student) continue;
      count += 1;

      const sectionLabel = (r.section ?? "").toLowerCase();
      const section = sectionByName.get(sectionLabel);
      if (section && year) {
        await tx
          .insert(enrollments)
          .values({
            schoolId: school.id,
            studentId: student.id,
            sectionId: section.id,
            schoolYearId: year.id,
          })
          .onConflictDoNothing();
        await emit(tx, school.id, "student.enrolled", {
          studentId: student.id,
          sectionId: section.id,
        });
      }
    }

    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "students.imported",
      after: { count },
    });
    return count;
  });

  revalidatePath("/setup");
  revalidatePath("/students");
  return { ok: `${inserted} students imported. Print their activation codes from Students.` };
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
  return { ok: `Invite sent to ${email}.` };
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

    const [user] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email: invite.email,
        name: name || invite.name,
        passwordHash: await hashPassword(password),
        status: "active",
      })
      .onConflictDoUpdate({
        target: [users.schoolId, users.email],
        set: { status: "active" },
      })
      .returning();

    await tx
      .insert(userRoles)
      .values({ schoolId: school.id, userId: user.id, role: invite.role })
      .onConflictDoNothing();
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: user.id,
      actorLabel: user.name,
      action: "staff.invite_accepted",
      after: { role: invite.role },
    });
    return { ok: "Account created.", userId: user.id };
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
