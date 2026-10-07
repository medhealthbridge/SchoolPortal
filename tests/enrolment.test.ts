import "../src/db/load-env";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { enrollments, students } from "@/db/schema";
import {
  applicationStatus,
  approveApplication,
  declineApplication,
  newReference,
  parseApplication,
  submitApplication,
  suggestStudentNumber,
} from "@/lib/enrolment";
import { dropSchool, makeSchool } from "./helpers";

const made: string[] = [];
afterAll(async () => {
  for (const id of made) await dropSchool(id);
});

const form = (over: Record<string, string> = {}) => ({
  grade_level: "Grade 7",
  first_name: "Lia",
  last_name: "Ramos",
  birth_date: "2014-02-03",
  sex: "female",
  lrn: "123456789012",
  guardian_name: "Rosa Ramos",
  guardian_phone: "0917 555 0101",
  consent: "yes",
  ...over,
});

describe("an online application", () => {
  it("is checked like the registrar's form, and needs consent", () => {
    expect(parseApplication(form()).value?.gradeLevel).toBe("Grade 7");
    expect(parseApplication(form({ consent: "" })).errors).toContain("Tick the box to agree to the privacy notice.");
    expect(parseApplication(form({ lrn: "123" })).errors).toContain("An LRN is 12 digits.");
    expect(newReference()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("goes from applied to enrolled, and a family can only see its own", async () => {
    const t = await makeSchool();
    made.push(t.school.id);
    const sid = t.school.id;
    const out = await withTenant(sid, async (tx) => {
      const app = await submitApplication(tx, sid, parseApplication(form()).value!);
      const wrongPhone = await applicationStatus(tx, sid, app.reference, "0999 000 0000");
      const rightPhone = await applicationStatus(tx, sid, app.reference.toLowerCase(), "+63 917 555 0101");
      const number = await suggestStudentNumber(tx, sid, 2026);
      const done = await approveApplication(tx, sid, {
        applicationId: app.id,
        studentNumber: number,
        sectionId: t.section.id,
        deciderId: t.teacher.id,
        note: null,
      });
      const twice = await approveApplication(tx, sid, {
        applicationId: app.id,
        studentNumber: "X-1",
        sectionId: t.section.id,
        deciderId: t.teacher.id,
        note: null,
      });
      const other = await submitApplication(tx, sid, parseApplication(form({ lrn: "", first_name: "Mae" })).value!);
      const no = await declineApplication(tx, sid, { applicationId: other.id, deciderId: t.teacher.id, note: "Grade 7 is full." });
      const id = "error" in done ? "" : done.student!.id;
      const enrolled = await tx
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.studentId, id), eq(enrollments.sectionId, t.section.id)));
      const [stu] = await tx.select().from(students).where(eq(students.id, id));
      return { wrongPhone, rightPhone, number, done, twice, no, enrolled, stu };
    });
    expect(out.wrongPhone).toBeNull();
    expect(out.rightPhone?.status).toBe("pending");
    expect(out.number).toMatch(/^2026-\d{4}$/);
    expect("student" in out.done).toBe(true);
    expect(out.enrolled).toHaveLength(1);
    expect(out.stu.lrn).toBe("123456789012");
    expect(out.stu.guardianPhone).toBe("0917 555 0101");
    expect("error" in out.twice).toBe(true);
    expect(out.no?.status).toBe("declined");
  });
});
