import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  attendanceRecords,
  rooms,
  sections,
  studentGuardians,
  timetableSlots,
  userRoles,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { can } from "@/lib/roles";
import {
  clashesFor,
  normaliseTime,
  overlaps,
  scheduleFor,
  sectionOfStudent,
  sectionsOfTeacher,
} from "@/lib/schedule";
import {
  acceptGuardianInvite,
  createGuardianInvite,
  guardiansOf,
  mayInviteFor,
  openInvite,
} from "@/lib/guardians";
import { teacherRoster } from "@/lib/staff";
import { announcementsFor } from "@/lib/announcements";
import { announcements } from "@/db/schema";
import { dropSchool, makeSchool } from "./helpers";

type School = Awaited<ReturnType<typeof makeSchool>>;
let s: School;
let other: School;

beforeAll(async () => {
  s = await makeSchool();
  other = await makeSchool();
});
afterAll(async () => {
  await dropSchool(s.school.id);
  await dropSchool(other.school.id);
});

async function addTeacher(school: School, name: string) {
  return withTenant(school.school.id, async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({
        schoolId: school.school.id,
        email: `${name.toLowerCase()}@${school.school.subdomain}.test`,
        name,
        passwordHash: await hashPassword("password123"),
      })
      .returning();
    await tx.insert(userRoles).values({ schoolId: school.school.id, userId: u!.id, role: "teacher" });
    return u!;
  });
}

describe("who does what", () => {
  it("lets the registrar, the principal and the admin add teachers and build the schedule", () => {
    for (const role of ["registrar", "principal", "school_admin"] as const) {
      expect(can([role], "staff.manage"), role).toBe(true);
      expect(can([role], "timetable.manage"), role).toBe(true);
    }
    expect(can(["teacher"], "staff.manage")).toBe(false);
    expect(can(["teacher"], "timetable.manage")).toBe(false);
  });

  it("lets teachers invite parents, and parents invite nobody", () => {
    expect(can(["teacher"], "guardians.invite")).toBe(true);
    expect(can(["adviser"], "guardians.invite")).toBe(true);
    expect(can(["parent"], "guardians.invite")).toBe(false);
    expect(can(["student"], "guardians.invite")).toBe(false);
  });
});

describe("the schedule", () => {
  it("reads times the way people type them", () => {
    expect(normaliseTime("7:30")).toBe("07:30:00");
    expect(normaliseTime("13:05:09")).toBe("13:05:09");
    expect(normaliseTime("25:00")).toBeNull();
    expect(normaliseTime("noon")).toBeNull();
  });

  it("lets one class end as the next begins", () => {
    expect(overlaps({ startsAt: "08:00:00", endsAt: "09:00:00" }, { startsAt: "09:00:00", endsAt: "10:00:00" })).toBe(false);
    expect(overlaps({ startsAt: "08:00:00", endsAt: "09:00:00" }, { startsAt: "08:30:00", endsAt: "09:30:00" })).toBe(true);
  });

  it("names the teacher, the section and the room that are already taken", async () => {
    const t2 = await addTeacher(s, "Reyes");
    const found = await withTenant(s.school.id, async (tx) => {
      const [room] = await tx
        .insert(rooms)
        .values({ schoolId: s.school.id, name: "Room 101" })
        .returning();
      await tx.update(timetableSlots).set({ roomId: room!.id }).where(eq(timetableSlots.id, s.slot.id));
      const [b] = await tx
        .insert(sections)
        .values({ schoolId: s.school.id, schoolYearId: s.year.id, level: "Grade 7", name: "B" })
        .returning();
      return {
        // Same teacher, another section, overlapping time.
        teacher: await clashesFor(tx, s.school.id, {
          schoolYearId: s.year.id, weekday: 1, startsAt: "08:30:00", endsAt: "09:30:00",
          teacherUserId: s.teacher.id, sectionId: b!.id, roomId: null,
        }),
        // Another teacher, same section.
        section: await clashesFor(tx, s.school.id, {
          schoolYearId: s.year.id, weekday: 1, startsAt: "08:00:00", endsAt: "09:00:00",
          teacherUserId: t2.id, sectionId: s.section.id, roomId: null,
        }),
        // Another teacher and section, same room.
        room: await clashesFor(tx, s.school.id, {
          schoolYearId: s.year.id, weekday: 1, startsAt: "08:15:00", endsAt: "08:45:00",
          teacherUserId: t2.id, sectionId: b!.id, roomId: room!.id,
        }),
        // Another day is free.
        free: await clashesFor(tx, s.school.id, {
          schoolYearId: s.year.id, weekday: 2, startsAt: "08:00:00", endsAt: "09:00:00",
          teacherUserId: s.teacher.id, sectionId: s.section.id, roomId: room!.id,
        }),
        // Changing the class itself does not clash with itself.
        self: await clashesFor(
          tx,
          s.school.id,
          {
            schoolYearId: s.year.id, weekday: 1, startsAt: "08:00:00", endsAt: "09:30:00",
            teacherUserId: s.teacher.id, sectionId: s.section.id, roomId: room!.id,
          },
          s.slot.id,
        ),
      };
    });
    expect(found.teacher.join(" ")).toMatch(/Teacher already teaches Math 7 to Grade 7 A/);
    expect(found.section.join(" ")).toMatch(/Grade 7 A already has Math 7 with Teacher/);
    expect(found.room.join(" ")).toMatch(/Room 101 is taken by Grade 7 A/);
    expect(found.free).toEqual([]);
    expect(found.self).toEqual([]);
  });

  it("leaves a retired class off every schedule but keeps its marks", async () => {
    const result = await withTenant(s.school.id, async (tx) => {
      const [extra] = await tx
        .insert(timetableSlots)
        .values({
          schoolId: s.school.id, schoolYearId: s.year.id, teacherUserId: s.teacher.id,
          subjectId: s.subject.id, sectionId: s.section.id, weekday: 3,
          startsAt: "10:00:00", endsAt: "11:00:00",
        })
        .returning();
      await tx.insert(attendanceRecords).values({
        id: crypto.randomUUID(), schoolId: s.school.id, studentId: s.students[0]!.id,
        slotId: extra!.id, onDate: "2026-09-02", status: "present", markedByUserId: s.teacher.id, markedAt: new Date(),
      });
      const before = (await scheduleFor(tx, s.school.id, { sectionIds: [s.section.id] })).length;
      await tx.update(timetableSlots).set({ retiredAt: new Date() }).where(eq(timetableSlots.id, extra!.id));
      const after = (await scheduleFor(tx, s.school.id, { sectionIds: [s.section.id] })).length;
      const marks = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.slotId, extra!.id));
      return { before, after, marks: marks.length };
    });
    expect(result.after).toBe(result.before - 1);
    expect(result.marks).toBe(1);
  });

  it("knows a student's section and adviser, and a teacher's sections", async () => {
    const r = await withTenant(s.school.id, async (tx) => {
      await tx.update(sections).set({ adviserUserId: s.teacher.id }).where(eq(sections.id, s.section.id));
      return {
        of: await sectionOfStudent(tx, s.school.id, s.students[0]!.id),
        taught: await sectionsOfTeacher(tx, s.school.id, s.teacher.id),
      };
    });
    expect(r.of?.id).toBe(s.section.id);
    expect(r.of?.adviserName).toBe("Teacher");
    expect(r.taught.map((t) => t.id)).toContain(s.section.id);
    expect(r.taught.find((t) => t.id === s.section.id)?.advises).toBe(true);
  });
});

describe("the teachers list", () => {
  it("lists teachers with their advisory, load and subjects, and nobody else", async () => {
    const roster = await withTenant(s.school.id, (tx) => teacherRoster(tx, s.school.id));
    const t = roster.find((r) => r.id === s.teacher.id)!;
    expect(t.subjects).toEqual(["Math 7"]);
    expect(t.classesPerWeek).toBeGreaterThanOrEqual(1);
    expect(t.advises).toContain("Grade 7 A");
    expect(roster.some((r) => r.id === s.parent.id)).toBe(false);
  });
});

describe("parent invites", () => {
  const teacherSession = () => ({ userId: s.teacher.id, roles: ["teacher" as const] });

  it("lets a teacher invite only for students in their classes", async () => {
    const stranger = await addTeacher(s, "Stranger");
    const r = await withTenant(s.school.id, async (tx) => ({
      own: await mayInviteFor(tx, s.school.id, teacherSession(), s.students[1]!.id),
      notTheirs: await mayInviteFor(tx, s.school.id, { userId: stranger.id, roles: ["teacher"] }, s.students[1]!.id),
      office: await mayInviteFor(tx, s.school.id, { userId: stranger.id, roles: ["registrar"] }, s.students[1]!.id),
      parent: await mayInviteFor(tx, s.school.id, { userId: s.parent.id, roles: ["parent"] }, s.students[1]!.id),
    }));
    expect(r).toEqual({ own: true, notTheirs: false, office: true, parent: false });
  });

  it("makes a new parent account from the link and links the child", async () => {
    const out = await withTenant(s.school.id, async (tx) => {
      const made = await createGuardianInvite(tx, {
        schoolId: s.school.id, studentId: s.students[1]!.id, name: "Ana Santos",
        email: "Ana.Santos@Example.test", relationship: "mother",
        invitedByUserId: s.teacher.id, invitedByName: "Teacher",
      });
      if ("error" in made) throw new Error(made.error);
      const open = await openInvite(tx, s.school.id, made.token);
      const accepted = await acceptGuardianInvite(tx, {
        schoolId: s.school.id, token: made.token, name: "Ana Santos", password: "a-long-password",
      });
      const again = await acceptGuardianInvite(tx, {
        schoolId: s.school.id, token: made.token, name: "x", password: "a-long-password",
      });
      return { open, accepted, again };
    });
    expect(out.open?.invite.email).toBe("ana.santos@example.test");
    expect(out.open?.account).toBeNull();
    expect("userId" in out.accepted).toBe(true);
    expect("error" in out.again).toBe(true); // a link works once
  });

  it("puts a second child on the same account, but only with that account's password", async () => {
    const out = await withTenant(s.school.id, async (tx) => {
      const made = await createGuardianInvite(tx, {
        schoolId: s.school.id, studentId: s.students[2]!.id, name: "Ana Santos",
        email: "ana.santos@example.test", relationship: "mother",
        invitedByUserId: s.teacher.id, invitedByName: "Teacher",
      });
      if ("error" in made) throw new Error(made.error);
      const wrong = await acceptGuardianInvite(tx, {
        schoolId: s.school.id, token: made.token, name: "Intruder", password: "not-her-password",
      });
      const right = await acceptGuardianInvite(tx, {
        schoolId: s.school.id, token: made.token, name: "", password: "a-long-password",
      });
      const [ana] = await tx.select().from(users).where(eq(users.email, "ana.santos@example.test"));
      const kids = await tx
        .select()
        .from(studentGuardians)
        .where(eq(studentGuardians.guardianUserId, ana!.id));
      const accounts = await tx.select().from(users).where(eq(users.email, "ana.santos@example.test"));
      return { wrong, right, kids: kids.length, accounts: accounts.length };
    });
    expect(out.wrong).toEqual({ error: "That password does not match the account for this email." });
    expect("userId" in out.right).toBe(true);
    expect(out.kids).toBe(2);
    expect(out.accounts).toBe(1);
  });

  it("will not invite a parent who is already linked, and reuses a waiting invite", async () => {
    const out = await withTenant(s.school.id, async (tx) => {
      const linked = await createGuardianInvite(tx, {
        schoolId: s.school.id, studentId: s.students[0]!.id, name: "Parent",
        email: s.parent.email!, relationship: "father",
        invitedByUserId: s.teacher.id, invitedByName: "Teacher",
      });
      const first = await createGuardianInvite(tx, {
        schoolId: s.school.id, studentId: s.students[0]!.id, name: "Lola",
        email: "lola@example.test", relationship: "grandparent",
        invitedByUserId: s.teacher.id, invitedByName: "Teacher",
      });
      const second = await createGuardianInvite(tx, {
        schoolId: s.school.id, studentId: s.students[0]!.id, name: "Lola",
        email: "lola@example.test", relationship: "grandparent",
        invitedByUserId: s.teacher.id, invitedByName: "Teacher",
      });
      const family = await guardiansOf(tx, s.school.id, s.students[0]!.id);
      return { linked, first, second, family };
    });
    expect("error" in out.linked).toBe(true);
    expect("token" in out.first && "token" in out.second && out.first.token === out.second.token).toBe(true);
    expect(out.family.pending.filter((p) => p.email === "lola@example.test")).toHaveLength(1);
  });

  it("never opens another school's invite", async () => {
    const token = await withTenant(s.school.id, async (tx) => {
      const made = await createGuardianInvite(tx, {
        schoolId: s.school.id, studentId: s.students[0]!.id, name: "Tito",
        email: "tito@example.test", relationship: "other",
        invitedByUserId: s.teacher.id, invitedByName: "Teacher",
      });
      return "token" in made ? made.token : "";
    });
    const seen = await withTenant(other.school.id, (tx) => openInvite(tx, other.school.id, token));
    expect(seen).toBeNull();
  });
});

describe("announcements a parent sees", () => {
  it("shows the whole school and their child's section, not other classes", async () => {
    const r = await withTenant(s.school.id, async (tx) => {
      const [b] = await tx
        .select()
        .from(sections)
        .where(and(eq(sections.schoolId, s.school.id), eq(sections.name, "B")));
      await tx.insert(announcements).values([
        { schoolId: s.school.id, title: "For everyone", body: "x" },
        { schoolId: s.school.id, title: "For 7-A", body: "x", sectionId: s.section.id },
        { schoolId: s.school.id, title: "For 7-B", body: "x", sectionId: b!.id },
      ]);
      const parentView = await announcementsFor(tx, s.school.id, { sectionIds: [s.section.id] });
      const staffView = await announcementsFor(tx, s.school.id, { everything: true });
      return { parent: parentView.map((p) => p.post.title), staff: staffView.map((p) => p.post.title) };
    });
    expect(r.parent).toContain("For everyone");
    expect(r.parent).toContain("For 7-A");
    expect(r.parent).not.toContain("For 7-B");
    expect(r.staff).toContain("For 7-B");
  });
});
