/**
 * Online enrolment: a family applies on the school's own site, the registrar
 * approves or declines, and an approved application becomes a learner in a
 * section, with the parent code sent to the family so they can sign up.
 */
import { randomInt } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { enrolmentApplications, enrollments, schoolYears, sections, students } from "@/db/schema";
import { emit } from "./audit";
import { activationCode } from "./password";
import { parseStudent } from "./student-profile";

/** The learner fields a family fills in: the registrar's record, less the school's own number. */
export const LEARNER_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "lrn",
  "birth_date",
  "sex",
  "place_of_birth",
  "mother_tongue",
  "religion",
  "ip_group",
  "four_ps",
  "disability",
  "psa_birth_cert_no",
  "address",
] as const;

// No 0/O or 1/I/L: it is read aloud over the phone and typed back.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newReference() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export type ApplicationInput = {
  gradeLevel: string;
  learner: Record<string, string>;
  previousSchool: string | null;
  guardianName: string;
  guardianRelationship: string | null;
  guardianPhone: string;
  guardianEmail: string | null;
};

const clean = (v: unknown) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
};

/** Checks an application with the same rules as the registrar's form. */
export function parseApplication(
  raw: Record<string, unknown>,
): { value: ApplicationInput; errors?: never } | { value?: never; errors: string[] } {
  const learner: Record<string, string> = {};
  for (const f of LEARNER_FIELDS) learner[f] = String(raw[f] ?? "");
  learner.four_ps = raw.four_ps ? "yes" : "no";
  const guardianName = clean(raw.guardian_name);
  const guardianPhone = clean(raw.guardian_phone);
  const checked = parseStudent({
    ...learner,
    // The school assigns its own number on approval.
    student_number: "pending",
    guardian_name: guardianName ?? "",
    guardian_phone: guardianPhone ?? "",
  });
  const errors = checked.errors ? [...checked.errors] : [];
  const gradeLevel = clean(raw.grade_level);
  if (!gradeLevel) errors.push("Choose the grade the learner is applying for.");
  if (!guardianName) errors.push("Enter the parent's or guardian's name.");
  if (!guardianPhone) errors.push("Enter a mobile number the school can reach.");
  if (!clean(raw.birth_date)) errors.push("Enter the learner's birth date.");
  const guardianEmail = clean(raw.guardian_email)?.toLowerCase() ?? null;
  if (guardianEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guardianEmail)) errors.push("Check the email address.");
  if (!raw.consent) errors.push("Tick the box to agree to the privacy notice.");
  if (errors.length) return { errors };
  return {
    value: {
      gradeLevel: gradeLevel!,
      learner,
      previousSchool: clean(raw.previous_school),
      guardianName: guardianName!,
      guardianRelationship: clean(raw.guardian_relationship),
      guardianPhone: guardianPhone!,
      guardianEmail,
    },
  };
}

export async function submitApplication(tx: Tx, schoolId: string, input: ApplicationInput) {
  for (let i = 0; i < 5; i++) {
    const reference = newReference();
    const [row] = await tx
      .insert(enrolmentApplications)
      .values({ schoolId, reference, ...input, privacyConsentAt: new Date() })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
  }
  throw new Error("Could not issue a reference");
}

/** The status a family sees, found by reference and the mobile number they gave. */
export async function applicationStatus(tx: Tx, schoolId: string, reference: string, phone: string) {
  const ref = reference.trim().toUpperCase();
  const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
  const [row] = await tx
    .select()
    .from(enrolmentApplications)
    .where(and(eq(enrolmentApplications.schoolId, schoolId), eq(enrolmentApplications.reference, ref)))
    .limit(1);
  if (!row || digits(row.guardianPhone) !== digits(phone) || digits(phone).length < 7) return null;
  return row;
}

export async function applicationsFor(tx: Tx, schoolId: string, status: string) {
  return tx
    .select()
    .from(enrolmentApplications)
    .where(and(eq(enrolmentApplications.schoolId, schoolId), eq(enrolmentApplications.status, status)))
    .orderBy(status === "pending" ? enrolmentApplications.createdAt : desc(enrolmentApplications.decidedAt));
}

/** A free student number: the year and the next sequence the school has not used. */
export async function suggestStudentNumber(tx: Tx, schoolId: string, year = new Date().getFullYear()) {
  const taken = new Set(
    (await tx.select({ n: students.studentNumber }).from(students).where(eq(students.schoolId, schoolId))).map(
      (r) => r.n,
    ),
  );
  for (let i = taken.size + 1; ; i++) {
    const n = `${year}-${String(i).padStart(4, "0")}`;
    if (!taken.has(n)) return n;
  }
}

/** Creates the learner from an approved application and places them in a section. */
export async function approveApplication(
  tx: Tx,
  schoolId: string,
  input: { applicationId: string; studentNumber: string; sectionId: string; deciderId: string; note: string | null },
) {
  const [app] = await tx
    .select()
    .from(enrolmentApplications)
    .where(and(eq(enrolmentApplications.schoolId, schoolId), eq(enrolmentApplications.id, input.applicationId)))
    .limit(1);
  if (!app) return { error: "That application is not this school's." } as const;
  if (app.status !== "pending") return { error: "That application was already decided." } as const;

  const parsed = parseStudent({
    ...(app.learner as Record<string, string>),
    student_number: input.studentNumber,
    guardian_name: app.guardianName,
    guardian_phone: app.guardianPhone,
  });
  if (parsed.errors) return { error: parsed.errors[0] } as const;
  const v = parsed.value;

  const others = await tx.select().from(students).where(eq(students.schoolId, schoolId));
  const same = others.find((o) => o.studentNumber === v.studentNumber);
  if (same) return { error: `Student number ${v.studentNumber} belongs to ${same.lastName}, ${same.firstName}.` } as const;
  const lrnTaken = v.lrn ? others.find((o) => o.lrn === v.lrn) : undefined;
  if (lrnTaken)
    return { error: `That LRN is already ${lrnTaken.lastName}, ${lrnTaken.firstName}'s, a learner on record here.` } as const;

  const [year] = await tx
    .select()
    .from(schoolYears)
    .where(and(eq(schoolYears.schoolId, schoolId), eq(schoolYears.isCurrent, true)))
    .limit(1);
  if (!year) return { error: "Set the current school year in Setup first." } as const;
  const [section] = await tx
    .select()
    .from(sections)
    .where(and(eq(sections.schoolId, schoolId), eq(sections.id, input.sectionId), eq(sections.schoolYearId, year.id)))
    .limit(1);
  if (!section) return { error: "Choose a section in the current school year." } as const;

  const { section: _s, ...columns } = v;
  void _s;
  const [student] = await tx
    .insert(students)
    .values({ schoolId, ...columns, activationCode: activationCode(), parentCode: activationCode() })
    .returning();
  await tx
    .insert(enrollments)
    .values({ schoolId, studentId: student.id, sectionId: section.id, schoolYearId: year.id });
  await emit(tx, schoolId, "student.enrolled", { studentId: student.id, sectionId: section.id });
  await tx
    .update(enrolmentApplications)
    .set({ status: "approved", studentId: student.id, decidedByUserId: input.deciderId, decidedAt: new Date(), decisionNote: input.note })
    .where(eq(enrolmentApplications.id, app.id));
  return { app, student, section } as const;
}

export async function declineApplication(
  tx: Tx,
  schoolId: string,
  input: { applicationId: string; deciderId: string; note: string },
) {
  const [app] = await tx
    .update(enrolmentApplications)
    .set({ status: "declined", decidedByUserId: input.deciderId, decidedAt: new Date(), decisionNote: input.note })
    .where(
      and(
        eq(enrolmentApplications.schoolId, schoolId),
        eq(enrolmentApplications.id, input.applicationId),
        eq(enrolmentApplications.status, "pending"),
      ),
    )
    .returning();
  return app ?? null;
}
