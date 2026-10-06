/**
 * What each module can hand out as a file, and who may take what.
 *
 * A dataset is a list of columns the person ticks and a query that fills them.
 * `restricted` columns are personal or sensitive; they are offered, and
 * exported, only to a role that holds `restrictedPermission`. The route
 * enforces that on the server, so unticking a box in the page is not what
 * protects a column.
 */
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  activities,
  attendanceRecords,
  auditLog,
  clubMemberships,
  clubs,
  enrollments,
  feeItems,
  gradingPeriods,
  incidents,
  offenseLevels,
  registrarRequests,
  scores,
  sections,
  serviceHours,
  studentCharges,
  studentPayments,
  students,
  subjects,
  timetableSlots,
  userRoles,
  users,
} from "@/db/schema";
import { ROLE_LABELS, type Permission, type Role } from "@/lib/roles";
import type { ExportRow } from "./files";

export type DatasetColumn = {
  key: string;
  label: string;
  /** Needs `restrictedPermission`. */
  restricted?: boolean;
  /** Offered but not ticked until the person ticks it. */
  off?: boolean;
};

export type Params = { from?: string; to?: string; withdrawn?: boolean };

export type Dataset = {
  key: string;
  label: string;
  title: string;
  permission: Permission;
  restrictedPermission?: Permission;
  columns: DatasetColumn[];
  dateRange?: boolean;
  withdrawnOption?: boolean;
  load(tx: Tx, schoolId: string, p: Params): Promise<ExportRow[]>;
};

const LIMIT = 20_000;
const peso = (centavos: number) => Math.round(centavos) / 100;
const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : "";
const section = (level: string | null, name: string | null) =>
  level ? `${level} ${name ?? ""}`.trim() : "";
const word = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const isDay = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

const DATASETS: Dataset[] = [
  {
    key: "students",
    label: "Students",
    title: "Students",
    permission: "students.view",
    restrictedPermission: "students.manage",
    withdrawnOption: true,
    columns: [
      { key: "student_number", label: "Student number" },
      { key: "lrn", label: "LRN", restricted: true },
      { key: "last_name", label: "Last name" },
      { key: "first_name", label: "First name" },
      { key: "middle_name", label: "Middle name" },
      { key: "suffix", label: "Suffix", off: true },
      { key: "section", label: "Section" },
      { key: "status", label: "Status", off: true },
      { key: "sex", label: "Sex", restricted: true },
      { key: "birth_date", label: "Birth date", restricted: true },
      { key: "place_of_birth", label: "Place of birth", restricted: true, off: true },
      { key: "mother_tongue", label: "Mother tongue", restricted: true, off: true },
      { key: "religion", label: "Religion", restricted: true, off: true },
      { key: "ip_group", label: "Indigenous group", restricted: true, off: true },
      { key: "four_ps", label: "4Ps beneficiary", restricted: true, off: true },
      { key: "disability", label: "Learner with disability", restricted: true, off: true },
      { key: "psa_birth_cert_no", label: "PSA birth certificate no.", restricted: true, off: true },
      { key: "address", label: "Home address", restricted: true, off: true },
      { key: "guardian_name", label: "Guardian's name", restricted: true },
      { key: "guardian_phone", label: "Guardian's phone", restricted: true },
    ],
    async load(tx, schoolId, p) {
      const rows = await tx
        .select({ s: students, level: sections.level, name: sections.name })
        .from(students)
        .leftJoin(enrollments, and(eq(enrollments.studentId, students.id), eq(enrollments.status, "active")))
        .leftJoin(sections, eq(sections.id, enrollments.sectionId))
        .where(
          and(
            eq(students.schoolId, schoolId),
            p.withdrawn ? undefined : isNull(students.archivedAt),
          ),
        )
        .orderBy(asc(students.lastName), asc(students.firstName))
        .limit(LIMIT);
      return rows.map(({ s, level, name }) => ({
        student_number: s.studentNumber,
        lrn: s.lrn,
        last_name: s.lastName,
        first_name: s.firstName,
        middle_name: s.middleName,
        suffix: s.suffix,
        section: section(level, name),
        status: s.archivedAt ? "Withdrawn" : "Enrolled",
        sex: s.sex ? word(s.sex) : "",
        birth_date: s.birthDate,
        place_of_birth: s.placeOfBirth,
        mother_tongue: s.motherTongue,
        religion: s.religion,
        ip_group: s.ipGroup,
        four_ps: s.fourPs ? "Yes" : "No",
        disability: s.disability,
        psa_birth_cert_no: s.psaBirthCertNo,
        address: s.address,
        guardian_name: s.guardianName,
        guardian_phone: s.guardianPhone,
      }));
    },
  },

  {
    key: "staff",
    label: "People and roles",
    title: "People and roles",
    permission: "users.manage",
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone", off: true },
      { key: "roles", label: "Roles" },
      { key: "status", label: "Account" },
      { key: "last_login", label: "Last signed in", off: true },
    ],
    async load(tx, schoolId) {
      const people = await tx
        .select()
        .from(users)
        .where(eq(users.schoolId, schoolId))
        .orderBy(asc(users.name))
        .limit(LIMIT);
      const held = await tx.select().from(userRoles).where(eq(userRoles.schoolId, schoolId));
      const byUser = new Map<string, string[]>();
      for (const r of held)
        byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), ROLE_LABELS[r.role as Role] ?? r.role]);
      return people.map((u) => ({
        name: u.name,
        email: u.email,
        phone: u.phone,
        roles: (byUser.get(u.id) ?? []).join(", "),
        status: word(u.status),
        last_login: day(u.lastLoginAt),
      }));
    },
  },

  {
    key: "attendance",
    label: "Attendance",
    title: "Attendance",
    permission: "attendance.view_all",
    dateRange: true,
    columns: [
      { key: "date", label: "Date" },
      { key: "section", label: "Section" },
      { key: "subject", label: "Subject" },
      { key: "student_number", label: "Student number" },
      { key: "student", label: "Student" },
      { key: "status", label: "Mark" },
      { key: "note", label: "Note", off: true },
    ],
    async load(tx, schoolId, p) {
      const from = isDay(p.from);
      const to = isDay(p.to);
      const rows = await tx
        .select({
          onDate: attendanceRecords.onDate,
          status: attendanceRecords.status,
          note: attendanceRecords.note,
          num: students.studentNumber,
          first: students.firstName,
          last: students.lastName,
          level: sections.level,
          sec: sections.name,
          subject: subjects.name,
        })
        .from(attendanceRecords)
        .innerJoin(students, eq(students.id, attendanceRecords.studentId))
        .innerJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.slotId))
        .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(
          and(
            eq(attendanceRecords.schoolId, schoolId),
            from ? gte(attendanceRecords.onDate, from) : undefined,
            to ? lte(attendanceRecords.onDate, to) : undefined,
          ),
        )
        .orderBy(desc(attendanceRecords.onDate), asc(sections.level), asc(sections.name), asc(students.lastName))
        .limit(LIMIT);
      return rows.map((r) => ({
        date: r.onDate,
        section: section(r.level, r.sec),
        subject: r.subject,
        student_number: r.num,
        student: `${r.last}, ${r.first}`,
        status: word(r.status),
        note: r.note,
      }));
    },
  },

  {
    key: "grades",
    label: "Grades",
    title: "Grades",
    permission: "grades.view_all",
    columns: [
      { key: "period", label: "Grading period" },
      { key: "section", label: "Section" },
      { key: "subject", label: "Subject" },
      { key: "student_number", label: "Student number" },
      { key: "student", label: "Student" },
      { key: "score", label: "Grade" },
      { key: "remarks", label: "Remarks", off: true },
    ],
    async load(tx, schoolId) {
      const rows = await tx
        .select({
          period: gradingPeriods.name,
          seq: gradingPeriods.sequence,
          subject: subjects.name,
          score: scores.score,
          remarks: scores.remarks,
          num: students.studentNumber,
          first: students.firstName,
          last: students.lastName,
          level: sections.level,
          sec: sections.name,
        })
        .from(scores)
        .innerJoin(gradingPeriods, eq(gradingPeriods.id, scores.gradingPeriodId))
        .innerJoin(subjects, eq(subjects.id, scores.subjectId))
        .innerJoin(students, eq(students.id, scores.studentId))
        .leftJoin(
          enrollments,
          and(eq(enrollments.studentId, students.id), eq(enrollments.status, "active")),
        )
        .leftJoin(sections, eq(sections.id, enrollments.sectionId))
        .where(eq(scores.schoolId, schoolId))
        .orderBy(asc(gradingPeriods.sequence), asc(sections.level), asc(sections.name), asc(students.lastName), asc(subjects.name))
        .limit(LIMIT);
      return rows.map((r) => ({
        period: r.period,
        section: section(r.level, r.sec),
        subject: r.subject,
        student_number: r.num,
        student: `${r.last}, ${r.first}`,
        score: r.score === null ? "" : Number(r.score),
        remarks: r.remarks,
      }));
    },
  },

  {
    key: "incidents",
    label: "Discipline incidents",
    title: "Discipline incidents",
    permission: "discipline.manage",
    dateRange: true,
    columns: [
      { key: "date", label: "Date" },
      { key: "student_number", label: "Student number" },
      { key: "student", label: "Student" },
      { key: "level", label: "Offense level" },
      { key: "summary", label: "What happened" },
    ],
    async load(tx, schoolId, p) {
      const from = isDay(p.from);
      const to = isDay(p.to);
      const rows = await tx
        .select({
          onDate: incidents.onDate,
          summary: incidents.summary,
          level: offenseLevels.name,
          num: students.studentNumber,
          first: students.firstName,
          last: students.lastName,
        })
        .from(incidents)
        .innerJoin(students, eq(students.id, incidents.studentId))
        .leftJoin(offenseLevels, eq(offenseLevels.id, incidents.offenseLevelId))
        .where(
          and(
            eq(incidents.schoolId, schoolId),
            from ? gte(incidents.onDate, from) : undefined,
            to ? lte(incidents.onDate, to) : undefined,
          ),
        )
        .orderBy(desc(incidents.onDate))
        .limit(LIMIT);
      return rows.map((r) => ({
        date: r.onDate,
        student_number: r.num,
        student: `${r.last}, ${r.first}`,
        level: r.level,
        summary: r.summary,
      }));
    },
  },

  {
    key: "charges",
    label: "Fees charged",
    title: "Fees charged",
    permission: "fees.manage",
    dateRange: true,
    columns: [
      { key: "date", label: "Charged on" },
      { key: "student_number", label: "Student number" },
      { key: "student", label: "Student" },
      { key: "fee", label: "Fee" },
      { key: "amount", label: "Amount (PHP)" },
    ],
    async load(tx, schoolId, p) {
      const from = isDay(p.from);
      const to = isDay(p.to);
      const rows = await tx
        .select({
          on: studentCharges.chargedOn,
          amount: studentCharges.amountCentavos,
          fee: feeItems.name,
          num: students.studentNumber,
          first: students.firstName,
          last: students.lastName,
        })
        .from(studentCharges)
        .innerJoin(students, eq(students.id, studentCharges.studentId))
        .innerJoin(feeItems, eq(feeItems.id, studentCharges.feeItemId))
        .where(
          and(
            eq(studentCharges.schoolId, schoolId),
            from ? gte(studentCharges.chargedOn, from) : undefined,
            to ? lte(studentCharges.chargedOn, to) : undefined,
          ),
        )
        .orderBy(desc(studentCharges.chargedOn), asc(students.lastName))
        .limit(LIMIT);
      return rows.map((r) => ({
        date: r.on,
        student_number: r.num,
        student: `${r.last}, ${r.first}`,
        fee: r.fee,
        amount: peso(r.amount),
      }));
    },
  },

  {
    key: "payments",
    label: "Payments received",
    title: "Payments received",
    permission: "fees.manage",
    dateRange: true,
    columns: [
      { key: "date", label: "Paid on" },
      { key: "receipt", label: "Receipt no." },
      { key: "student_number", label: "Student number" },
      { key: "student", label: "Student" },
      { key: "amount", label: "Amount (PHP)" },
      { key: "method", label: "Method" },
      { key: "reference", label: "Reference", off: true },
    ],
    async load(tx, schoolId, p) {
      const from = isDay(p.from);
      const to = isDay(p.to);
      const rows = await tx
        .select({
          paidOn: studentPayments.paidOn,
          receipt: studentPayments.receiptNo,
          amount: studentPayments.amountCentavos,
          method: studentPayments.method,
          reference: studentPayments.reference,
          num: students.studentNumber,
          first: students.firstName,
          last: students.lastName,
        })
        .from(studentPayments)
        .innerJoin(students, eq(students.id, studentPayments.studentId))
        .where(
          and(
            eq(studentPayments.schoolId, schoolId),
            from ? gte(studentPayments.paidOn, from) : undefined,
            to ? lte(studentPayments.paidOn, to) : undefined,
          ),
        )
        .orderBy(desc(studentPayments.paidOn))
        .limit(LIMIT);
      return rows.map((r) => ({
        date: r.paidOn,
        receipt: r.receipt,
        student_number: r.num,
        student: `${r.last}, ${r.first}`,
        amount: peso(r.amount),
        method: word(r.method),
        reference: r.reference,
      }));
    },
  },

  {
    key: "registrar-requests",
    label: "Registrar requests",
    title: "Registrar requests",
    permission: "registrar.manage",
    columns: [
      { key: "requested", label: "Requested" },
      { key: "student_number", label: "Student number" },
      { key: "student", label: "Student" },
      { key: "purpose", label: "For" },
      { key: "status", label: "Status" },
      { key: "hold", label: "Held because", off: true },
      { key: "released", label: "Released", off: true },
    ],
    async load(tx, schoolId) {
      const rows = await tx
        .select({
          r: registrarRequests,
          num: students.studentNumber,
          first: students.firstName,
          last: students.lastName,
        })
        .from(registrarRequests)
        .innerJoin(students, eq(students.id, registrarRequests.studentId))
        .where(eq(registrarRequests.schoolId, schoolId))
        .orderBy(desc(registrarRequests.requestedAt))
        .limit(LIMIT);
      return rows.map(({ r, num, first, last }) => ({
        requested: day(r.requestedAt),
        student_number: num,
        student: `${last}, ${first}`,
        purpose: r.purpose,
        status: r.releasedAt ? "Released" : r.holdReason ? "On hold" : "Open",
        hold: r.holdReason,
        released: day(r.releasedAt),
      }));
    },
  },

  {
    key: "club-members",
    label: "Club members",
    title: "Club members",
    permission: "sao.manage",
    columns: [
      { key: "club", label: "Club" },
      { key: "student_number", label: "Student number" },
      { key: "student", label: "Student" },
      { key: "role", label: "Role in the club" },
    ],
    async load(tx, schoolId) {
      const rows = await tx
        .select({
          club: clubs.name,
          role: clubMemberships.role,
          num: students.studentNumber,
          first: students.firstName,
          last: students.lastName,
        })
        .from(clubMemberships)
        .innerJoin(clubs, eq(clubs.id, clubMemberships.clubId))
        .innerJoin(students, eq(students.id, clubMemberships.studentId))
        .where(eq(clubMemberships.schoolId, schoolId))
        .orderBy(asc(clubs.name), asc(students.lastName))
        .limit(LIMIT);
      return rows.map((r) => ({
        club: r.club,
        student_number: r.num,
        student: `${r.last}, ${r.first}`,
        role: word(r.role),
      }));
    },
  },

  {
    key: "service-hours",
    label: "Service hours",
    title: "Service hours",
    permission: "chaplain.manage",
    dateRange: true,
    columns: [
      { key: "date", label: "Logged" },
      { key: "activity", label: "Activity" },
      { key: "student_number", label: "Student number" },
      { key: "student", label: "Student" },
      { key: "hours", label: "Hours" },
    ],
    async load(tx, schoolId, p) {
      const from = isDay(p.from);
      const to = isDay(p.to);
      const rows = await tx
        .select({
          at: serviceHours.loggedAt,
          hours: serviceHours.hours,
          activity: activities.name,
          num: students.studentNumber,
          first: students.firstName,
          last: students.lastName,
        })
        .from(serviceHours)
        .innerJoin(students, eq(students.id, serviceHours.studentId))
        .innerJoin(activities, eq(activities.id, serviceHours.activityId))
        .where(
          and(
            eq(serviceHours.schoolId, schoolId),
            from ? gte(serviceHours.loggedAt, new Date(`${from}T00:00:00+08:00`)) : undefined,
            to ? lte(serviceHours.loggedAt, new Date(`${to}T23:59:59+08:00`)) : undefined,
          ),
        )
        .orderBy(desc(serviceHours.loggedAt))
        .limit(LIMIT);
      return rows.map((r) => ({
        date: day(r.at),
        activity: r.activity,
        student_number: r.num,
        student: `${r.last}, ${r.first}`,
        hours: Number(r.hours),
      }));
    },
  },

  {
    key: "audit",
    label: "Audit log",
    title: "Audit log",
    permission: "audit.view",
    dateRange: true,
    columns: [
      { key: "when", label: "When" },
      { key: "who", label: "Who" },
      { key: "action", label: "What" },
      { key: "record", label: "Record", off: true },
    ],
    async load(tx, schoolId, p) {
      const from = isDay(p.from);
      const to = isDay(p.to);
      const rows = await tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.schoolId, schoolId),
            from ? gte(auditLog.at, new Date(`${from}T00:00:00+08:00`)) : undefined,
            to ? lte(auditLog.at, new Date(`${to}T23:59:59+08:00`)) : undefined,
          ),
        )
        .orderBy(desc(auditLog.at))
        .limit(LIMIT);
      return rows.map((r) => ({
        when: r.at.toLocaleString("en-CA", { timeZone: "Asia/Manila", hour12: false }),
        who: r.actorLabel,
        action: word(r.action.replace(/[._]/g, " ")),
        record: r.entity ? `${r.entity} ${r.entityId ?? ""}`.trim() : "",
      }));
    },
  },
];

export const EXPORTS: Record<string, Dataset> = Object.fromEntries(
  DATASETS.map((d) => [d.key, d]),
);

/**
 * Turns the query string into what to write. Unknown columns are dropped,
 * restricted ones are dropped unless the caller holds the permission, and an
 * empty selection falls back to the columns that are on by default.
 */
export function chooseColumns(
  dataset: Dataset,
  asked: string[],
  mayRestricted: boolean,
): DatasetColumn[] {
  const allowed = dataset.columns.filter((c) => !c.restricted || mayRestricted);
  const picked = allowed.filter((c) => asked.includes(c.key));
  return picked.length > 0 ? picked : allowed.filter((c) => !c.off);
}
