import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { students } from "@/db/schema";
import { readSheet } from "@/lib/csv";
import { can } from "@/lib/roles";
import {
  STUDENT_COLUMNS,
  parseStudent,
  studentTemplateCsv,
} from "@/lib/student-profile";
import { dropSchool, makeSchool } from "./helpers";

const NOW = new Date("2026-10-06T00:00:00Z");
const base = { student_number: "2025-0001", first_name: "Maria", last_name: "Dela Cruz" };

describe("who may change student records", () => {
  it("gives the registrar the records and the school admin only a view", () => {
    expect(can(["registrar"], "students.manage")).toBe(true);
    expect(can(["school_admin"], "students.manage")).toBe(false);
    expect(can(["school_admin"], "students.view")).toBe(true);
  });

  it("keeps everyone else out", () => {
    for (const role of [
      "principal",
      "teacher",
      "adviser",
      "discipline_officer",
      "guidance_counselor",
      "sao_staff",
      "chaplain",
      "accounting",
      "parent",
      "student",
    ] as const)
      expect(can([role], "students.manage"), role).toBe(false);
  });
});

describe("parseStudent", () => {
  it("accepts just a name and a number", () => {
    const r = parseStudent(base, NOW);
    expect(r.errors).toBeUndefined();
    expect(r.value).toMatchObject({ firstName: "Maria", fourPs: false, lrn: null, sex: null });
  });

  it("requires the three essentials", () => {
    const r = parseStudent({}, NOW);
    expect(r.errors).toHaveLength(3);
  });

  it("holds an LRN to twelve digits and tolerates spaces and dashes", () => {
    expect(parseStudent({ ...base, lrn: "12345" }, NOW).errors).toEqual(["An LRN is 12 digits."]);
    expect(parseStudent({ ...base, lrn: "1234-5678 9012" }, NOW).value?.lrn).toBe("123456789012");
  });

  it("rejects an impossible or future birth date", () => {
    expect(parseStudent({ ...base, birth_date: "2012-02-30" }, NOW).errors).toBeDefined();
    expect(parseStudent({ ...base, birth_date: "30/06/2012" }, NOW).errors).toBeDefined();
    expect(parseStudent({ ...base, birth_date: "2030-01-01" }, NOW).errors).toEqual([
      "The birth date is in the future.",
    ]);
    expect(parseStudent({ ...base, birth_date: "2012-06-30" }, NOW).value?.birthDate).toBe(
      "2012-06-30",
    );
  });

  it("reads sex and 4Ps in the forms a spreadsheet uses", () => {
    expect(parseStudent({ ...base, sex: "F" }, NOW).value?.sex).toBe("female");
    expect(parseStudent({ ...base, sex: "Male" }, NOW).value?.sex).toBe("male");
    expect(parseStudent({ ...base, sex: "x" }, NOW).errors).toBeDefined();
    expect(parseStudent({ ...base, four_ps: "Yes" }, NOW).value?.fourPs).toBe(true);
    expect(parseStudent({ ...base, four_ps: "no" }, NOW).value?.fourPs).toBe(false);
    expect(parseStudent({ ...base, four_ps: "maybe" }, NOW).errors).toBeDefined();
  });

  it("turns blanks into nothing and collapses stray spaces", () => {
    const r = parseStudent({ ...base, first_name: "  Maria   Luisa ", religion: "   " }, NOW);
    expect(r.value?.firstName).toBe("Maria Luisa");
    expect(r.value?.religion).toBeNull();
  });
});

describe("the spreadsheet template", () => {
  it("lists every column and its example row is itself a valid import", () => {
    const { header, records, issues } = readSheet(studentTemplateCsv(), [
      "student_number",
      "first_name",
      "last_name",
    ]);
    expect(issues).toEqual([]);
    expect(header).toEqual([...STUDENT_COLUMNS]);
    expect(records).toHaveLength(1);
    const parsed = parseStudent(records[0], NOW);
    expect(parsed.errors).toBeUndefined();
    expect(parsed.value?.section).toBe("Grade 7 Rizal");
  });
});

describe("student records in the database", () => {
  const made: string[] = [];
  afterAll(async () => {
    for (const id of made) await dropSchool(id);
  });

  it("keeps an LRN unique within a school but not across schools", async () => {
    const a = await makeSchool();
    const b = await makeSchool();
    made.push(a.school.id, b.school.id);
    const row = (schoolId: string, n: string) => ({
      schoolId,
      studentNumber: n,
      firstName: "Ana",
      lastName: "Reyes",
      lrn: "111122223333",
      activationCode: "AAAAAAAA",
      parentCode: "BBBBBBBB",
    });

    await withTenant(a.school.id, (tx) => tx.insert(students).values(row(a.school.id, "x1")));
    await expect(
      withTenant(a.school.id, (tx) => tx.insert(students).values(row(a.school.id, "x2"))),
    ).rejects.toThrow();
    await withTenant(b.school.id, (tx) => tx.insert(students).values(row(b.school.id, "x1")));

    const found = await withTenant(b.school.id, (tx) =>
      tx.select().from(students).where(eq(students.lrn, "111122223333")),
    );
    expect(found).toHaveLength(1);
  });

  it("allows many students with no LRN", async () => {
    const a = await makeSchool();
    made.push(a.school.id);
    for (const n of ["n1", "n2", "n3"])
      await withTenant(a.school.id, (tx) =>
        tx.insert(students).values({
          schoolId: a.school.id,
          studentNumber: n,
          firstName: "A",
          lastName: "B",
          activationCode: "AAAAAAAA",
          parentCode: "BBBBBBBB",
        }),
      );
  });
});
