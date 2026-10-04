import "../src/db/load-env";
import { eq } from "drizzle-orm";
import { withPlatform, withTenant } from "@/db";
import {
  branches,
  enrollments,
  schoolYears,
  schools,
  sections,
  studentGuardians,
  students,
  subjects,
  subscriptions,
  timetableSlots,
  userRoles,
  users,
} from "@/db/schema";
import { activationCode, hashPassword } from "@/lib/password";
import { applyTierModules } from "@/lib/tenant";
import { PER_STUDENT_CENTAVOS, platformFeeCentavos } from "@/lib/pricing";

let counter = 0;

/** A throwaway school with one section, one teacher and three students. */
export async function makeSchool(opts: { tier?: "starter" | "all_in"; status?: "active" | "suspended" } = {}) {
  counter += 1;
  const subdomain = `t${Date.now().toString(36)}${counter}`;
  const tier = opts.tier ?? "all_in";

  const school = await withPlatform(async (tx) => {
    const [row] = await tx
      .insert(schools)
      .values({
        subdomain,
        name: `Test ${subdomain}`,
        tier,
        status: opts.status ?? "active",
        ownerName: "Owner",
        ownerEmail: `owner@${subdomain}.test`,
        emailVerifiedAt: new Date(),
      })
      .returning();
    await tx.insert(subscriptions).values({
      schoolId: row.id,
      tier,
      extraModules: [] as never,
      platformFeeCentavos: platformFeeCentavos(tier),
      perStudentCentavos: PER_STUDENT_CENTAVOS,
      startedOn: "2026-06-01",
    });
    return row;
  });

  await applyTierModules(school.id, tier);

  const ctx = await withTenant(school.id, async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ schoolId: school.id, name: "Main", isMain: true })
      .returning();
    const [teacher] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email: `teacher@${subdomain}.test`,
        name: "Teacher",
        passwordHash: await hashPassword("password123"),
      })
      .returning();
    await tx.insert(userRoles).values([
      { schoolId: school.id, userId: teacher.id, role: "teacher" },
      { schoolId: school.id, userId: teacher.id, role: "adviser" },
    ]);

    const [parent] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email: `parent@${subdomain}.test`,
        name: "Parent",
        phone: "+639170000001",
        passwordHash: await hashPassword("password123"),
      })
      .returning();
    await tx
      .insert(userRoles)
      .values({ schoolId: school.id, userId: parent.id, role: "parent" });

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
        name: "A",
      })
      .returning();
    const [subject] = await tx
      .insert(subjects)
      .values({ schoolId: school.id, code: "MATH7", name: "Math 7" })
      .returning();
    const [slot] = await tx
      .insert(timetableSlots)
      .values({
        schoolId: school.id,
        schoolYearId: year.id,
        teacherUserId: teacher.id,
        subjectId: subject.id,
        sectionId: section.id,
        weekday: 1,
        startsAt: "08:00:00",
        endsAt: "09:00:00",
      })
      .returning();

    const studentRows = [];
    for (let i = 0; i < 3; i++) {
      const [student] = await tx
        .insert(students)
        .values({
          schoolId: school.id,
          branchId: branch.id,
          studentNumber: `S-${i + 1}`,
          firstName: `First${i}`,
          lastName: `Last${i}`,
          activationCode: activationCode(),
          parentCode: activationCode(),
        })
        .returning();
      await tx.insert(enrollments).values({
        schoolId: school.id,
        studentId: student.id,
        sectionId: section.id,
        schoolYearId: year.id,
      });
      studentRows.push(student);
    }

    // The first student has a guardian, so parent alerts have somewhere to go.
    await tx.insert(studentGuardians).values({
      schoolId: school.id,
      studentId: studentRows[0].id,
      guardianUserId: parent.id,
      relationship: "parent",
    });

    return { teacher, parent, year, section, slot, students: studentRows };
  });

  return { school, ...ctx };
}

export async function dropSchool(schoolId: string) {
  await withPlatform((tx) => tx.delete(schools).where(eq(schools.id, schoolId)));
}
