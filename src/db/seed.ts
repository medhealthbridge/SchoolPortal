/**
 * Two demo schools, so the isolation story is visible from the first minute:
 * St. Mary (All-in, active, a full week of attendance) and Northgate
 * (Starter, suspended). Plus the platform admin.
 *
 * Re-runnable: it clears tenant data first.
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { db, withPlatform, withTenant } from "./index";
import {
  branches,
  enrollments,
  platformAdmins,
  rooms,
  schoolYears,
  schools,
  seatPlans,
  sections,
  students,
  studentGuardians,
  subjects,
  subscriptions,
  timetableSlots,
  userRoles,
  users,
} from "./schema";
import { activationCode, hashPassword } from "@/lib/password";
import { seedModules } from "./seed-modules";
import { applyTierModules } from "@/lib/tenant";
import { generateTotpSecret, otpauthUrl, totp } from "@/lib/totp";
import { PER_STUDENT_CENTAVOS, platformFeeCentavos } from "@/lib/pricing";
import { submitAttendance } from "@/modules/attendance/submit";
import { processEvents } from "@/lib/events";
import { issueInvoices } from "@/lib/invoicing";
import { randomUUID } from "node:crypto";

const FIRST_NAMES = [
  "Althea", "Bea", "Carlo", "Dana", "Elias", "Faye", "Gabriel", "Hannah",
  "Ivan", "Jonas", "Kyla", "Luis", "Mika", "Noel", "Odette", "Paolo",
  "Queenie", "Rafael", "Sofia", "Teo", "Uma", "Vince", "Wena", "Xandra",
];
const LAST_NAMES = [
  "Alonzo", "Bautista", "Cruz", "Dizon", "Espino", "Fajardo", "Gonzales",
  "Hernandez", "Ignacio", "Javier", "Katigbak", "Lim", "Mercado", "Navarro",
  "Ocampo", "Prieto", "Quiambao", "Reyes", "Santos", "Tolentino", "Uy",
  "Villanueva", "Wong", "Yap",
];

async function main() {
  console.log("→ clearing");
  await withPlatform(async (tx) => {
    await tx.delete(schools);
  });
  await db.delete(platformAdmins);

  console.log("→ platform admin");
  const totpSecret = generateTotpSecret();
  const [admin] = await db
    .insert(platformAdmins)
    .values({
      email: process.env.PLATFORM_ADMIN_EMAIL ?? "admin@yourapp.com",
      name: "Platform admin",
      passwordHash: await hashPassword(process.env.PLATFORM_ADMIN_PASSWORD ?? "admin12345"),
      totpSecret,
    })
    .returning();

  const stmary = await createSchool({
    subdomain: "stmary",
    name: "St. Mary Academy",
    tier: "all_in",
    status: "active",
    students: 48,
    withAttendance: true,
    withModules: true,
  });

  const northgate = await createSchool({
    subdomain: "northgate",
    name: "Northgate College",
    tier: "starter",
    status: "suspended",
    students: 20,
    withAttendance: false,
  });

  console.log("→ issuing this month's invoices");
  await issueInvoices(new Date().toISOString().slice(0, 7));

  const root = process.env.ROOT_DOMAIN ?? "lvh.me:3000";
  console.log(`
✓ Seeded.

  Platform admin   http://admin.${root}/login
                   ${admin.email} / ${process.env.PLATFORM_ADMIN_PASSWORD ?? "admin12345"}
                   TOTP secret ${totpSecret}
                   current code ${totp(totpSecret)}
                   ${otpauthUrl(totpSecret, admin.email)}

  St. Mary         http://stmary.${root}/login   (All-in, active)
                   admin@stmary.example / password123
                   teacher: tcruz@stmary.example / password123
                   one account per office, all password123:
                     discipline@stmary.example  guidance@stmary.example
                     sao@stmary.example  chaplain@stmary.example  cashier@stmary.example
                   a student: ${stmary.sampleStudentNumber} / code ${stmary.sampleActivationCode}
                   parent code for that student: ${stmary.sampleParentCode}

  Northgate        http://northgate.${root}/login (Starter, SUSPENDED)
                   admin@northgate.example / password123
                   ${northgate.sampleStudentNumber} is in Northgate only — St. Mary cannot see it.
`);
  process.exit(0);
}

type SeedArgs = {
  subdomain: string;
  name: string;
  tier: "starter" | "academic" | "student_life" | "all_in";
  status: "active" | "suspended";
  students: number;
  withAttendance: boolean;
  /** Fill the other modules too, so every screen has something on it. */
  withModules?: boolean;
};

async function createSchool(args: SeedArgs) {
  console.log(`→ ${args.name}`);
  const password = await hashPassword("password123");

  const school = await withPlatform(async (tx) => {
    const [row] = await tx
      .insert(schools)
      .values({
        subdomain: args.subdomain,
        name: args.name,
        type: "k12",
        tier: args.tier,
        status: args.status,
        ownerName: `${args.name} owner`,
        ownerEmail: `admin@${args.subdomain}.example`,
        ownerMobile: "+639170000000",
        emailVerifiedAt: new Date(),
        onboardingStep: 9,
        suspendedAt: args.status === "suspended" ? new Date() : null,
        suspendedReason: args.status === "suspended" ? "Invoice unpaid for 45 days" : null,
      })
      .returning();
    await tx.insert(subscriptions).values({
      schoolId: row.id,
      tier: args.tier,
      extraModules: [] as never,
      platformFeeCentavos: platformFeeCentavos(args.tier),
      perStudentCentavos: PER_STUDENT_CENTAVOS,
      startedOn: new Date().toISOString().slice(0, 10),
    });
    return row;
  });

  await applyTierModules(school.id, args.tier);

  return withTenant(school.id, async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ schoolId: school.id, name: "Main campus", isMain: true })
      .returning();

    const [owner] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email: `admin@${args.subdomain}.example`,
        name: "School admin",
        passwordHash: password,
        status: "active",
      })
      .returning();
    await tx.insert(userRoles).values([
      { schoolId: school.id, userId: owner.id, role: "school_admin" },
      { schoolId: school.id, userId: owner.id, role: "registrar" },
    ]);

    const [principal] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email: `principal@${args.subdomain}.example`,
        name: "Maria Santos",
        passwordHash: password,
        status: "active",
      })
      .returning();
    await tx
      .insert(userRoles)
      .values({ schoolId: school.id, userId: principal.id, role: "principal" });

    const [teacher] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email: `tcruz@${args.subdomain}.example`,
        name: "Teresa Cruz",
        passwordHash: password,
        status: "active",
      })
      .returning();
    await tx.insert(userRoles).values([
      { schoolId: school.id, userId: teacher.id, role: "teacher" },
      { schoolId: school.id, userId: teacher.id, role: "adviser" },
    ]);

    // One account per office, so every module's screens have an owner.
    const offices: { role: "discipline_officer" | "guidance_counselor" | "sao_staff" | "chaplain" | "accounting"; name: string; handle: string }[] = [
      { role: "discipline_officer", name: "Ramon Bautista", handle: "discipline" },
      { role: "guidance_counselor", name: "Grace Lim", handle: "guidance" },
      { role: "sao_staff", name: "Paolo Reyes", handle: "sao" },
      { role: "chaplain", name: "Fr. Luis Mendoza", handle: "chaplain" },
      { role: "accounting", name: "Nora Castillo", handle: "cashier" },
    ];
    for (const office of offices) {
      const [staff] = await tx
        .insert(users)
        .values({
          schoolId: school.id,
          email: `${office.handle}@${args.subdomain}.example`,
          name: office.name,
          passwordHash: password,
          status: "active",
        })
        .returning();
      await tx
        .insert(userRoles)
        .values({ schoolId: school.id, userId: staff.id, role: office.role });
    }

    const [parent] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email: `parent@${args.subdomain}.example`,
        name: "Lito Reyes",
        phone: "+639171234567",
        passwordHash: password,
        status: "active",
      })
      .returning();
    await tx.insert(userRoles).values({ schoolId: school.id, userId: parent.id, role: "parent" });

    const [year] = await tx
      .insert(schoolYears)
      .values({
        schoolId: school.id,
        name: "2026–2027",
        startsOn: "2026-06-01",
        endsOn: "2027-03-31",
        isCurrent: true,
      })
      .returning();

    const [section] = await tx
      .insert(sections)
      .values({
        schoolId: school.id,
        branchId: branch.id,
        schoolYearId: year.id,
        level: "Grade 7",
        name: "Sampaguita",
        adviserUserId: teacher.id,
      })
      .returning();

    const [room] = await tx
      .insert(rooms)
      .values({ schoolId: school.id, branchId: branch.id, name: "Room 201", rows: 6, cols: 8 })
      .returning();

    const subjectRows = await tx
      .insert(subjects)
      .values([
        { schoolId: school.id, code: "MATH7", name: "Mathematics 7" },
        { schoolId: school.id, code: "ENG7", name: "English 7" },
        { schoolId: school.id, code: "SCI7", name: "Science 7" },
      ])
      .returning();

    const studentRows = [];
    for (let i = 0; i < args.students; i++) {
      const first = FIRST_NAMES[i % FIRST_NAMES.length];
      const last = LAST_NAMES[(i * 7 + Math.floor(i / LAST_NAMES.length) * 3) % LAST_NAMES.length];
      const [student] = await tx
        .insert(students)
        .values({
          schoolId: school.id,
          branchId: branch.id,
          studentNumber: `${args.subdomain.slice(0, 2).toUpperCase()}-2026-${String(i + 1).padStart(4, "0")}`,
          firstName: first,
          lastName: last,
          activationCode: activationCode(),
          parentCode: activationCode(),
        })
        .returning();
      studentRows.push(student);
      await tx.insert(enrollments).values({
        schoolId: school.id,
        studentId: student.id,
        sectionId: section.id,
        schoolYearId: year.id,
      });
    }

    await tx.insert(studentGuardians).values({
      schoolId: school.id,
      studentId: studentRows[0].id,
      guardianUserId: parent.id,
      relationship: "parent",
    });

    // A seat plan for the room, left to right, 8 to a row.
    await tx.insert(seatPlans).values({
      schoolId: school.id,
      sectionId: section.id,
      roomId: room.id,
      layout: studentRows.map((s, i) => ({
        studentId: s.id,
        row: Math.floor(i / 8),
        col: i % 8,
      })) as never,
    });

    const slotRows = [];
    for (let weekday = 1; weekday <= 5; weekday++) {
      for (const [i, subject] of subjectRows.entries()) {
        const [slot] = await tx
          .insert(timetableSlots)
          .values({
            schoolId: school.id,
            schoolYearId: year.id,
            teacherUserId: teacher.id,
            subjectId: subject.id,
            sectionId: section.id,
            roomId: room.id,
            weekday,
            startsAt: `0${7 + i * 2}:30:00`,
            endsAt: `0${8 + i * 2}:30:00`,
          })
          .returning();
        slotRows.push(slot);
      }
    }

    const sample = studentRows[0];
    const result = {
      schoolId: school.id,
      sampleStudentNumber: sample.studentNumber,
      sampleActivationCode: sample.activationCode,
      sampleParentCode: sample.parentCode,
      teacherId: teacher.id,
      principalId: principal.id,
      ownerId: owner.id,
      parentId: parent.id,
      yearId: year.id,
      sectionId: section.id,
      subjectIds: subjectRows.map((s) => s.id),
      slotIds: slotRows.map((s) => s.id),
      studentIds: studentRows.map((s) => s.id),
      studentNumbers: studentRows.map((s) => s.studentNumber),
    };
    return result;
  }).then(async (ctx) => {
    if (args.withAttendance) await seedAttendance(ctx);
    if (args.withModules) await seedModules(ctx);
    return ctx;
  });
}

/** A week of attendance, with one student on a three-day absence streak. */
async function seedAttendance(ctx: {
  schoolId: string;
  teacherId: string;
  slotIds: string[];
  studentIds: string[];
}) {
  const today = new Date();
  const schoolDays: { onDate: string; weekday: number }[] = [];
  for (let back = 0; back < 14 && schoolDays.length < 5; back++) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    const weekday = ((day.getDay() + 6) % 7) + 1;
    if (weekday > 5) continue;
    schoolDays.push({ onDate: day.toISOString().slice(0, 10), weekday });
  }
  schoolDays.reverse();

  for (const [index, { onDate, weekday }] of schoolDays.entries()) {
    const daySlots = ctx.slotIds.slice((weekday - 1) * 3, (weekday - 1) * 3 + 3);
    // Student 0 misses the last three school days: a streak the adviser and
    // guidance both get flagged on.
    const streakDay = index >= schoolDays.length - 3;
    const records = [];
    for (const slotId of daySlots) {
      for (const [i, studentId] of ctx.studentIds.entries()) {
        const absent = i === 0 && streakDay;
        const late = !absent && (i + index) % 11 === 3;
        records.push({
          id: randomUUID(),
          studentId,
          slotId,
          onDate,
          status: absent ? ("absent" as const) : late ? ("late" as const) : ("present" as const),
          markedAt: new Date(`${onDate}T08:05:00Z`).toISOString(),
        });
      }
    }
    await submitAttendance(ctx.schoolId, ctx.teacherId, "Teresa Cruz", records);
  }
  await processEvents(ctx.schoolId, 5000);
}

await main();
