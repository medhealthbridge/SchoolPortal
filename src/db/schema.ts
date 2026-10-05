import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const schoolStatus = pgEnum("school_status", [
  "trial",
  "active",
  "past_due",
  "suspended",
]);

export const schoolType = pgEnum("school_type", ["k12", "senior_high", "college"]);

export const tierKey = pgEnum("tier_key", [
  "starter",
  "academic",
  "student_life",
  "all_in",
]);

/** Roles. Platform admin is NOT here: it lives outside any school. */
export const roleKey = pgEnum("role_key", [
  "school_admin",
  "principal",
  "registrar",
  "teacher",
  "adviser",
  "discipline_officer",
  "guidance_counselor",
  "sao_staff",
  "chaplain",
  "accounting",
  "parent",
  "student",
]);

export const userStatus = pgEnum("user_status", ["invited", "active", "disabled"]);

export const attendanceStatus = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "excused",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "void",
]);

/* ------------------------------------------------------------------ *
 * Platform level (no school_id — these are yours, not a tenant's)
 * ------------------------------------------------------------------ */

export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schools = pgTable(
  "schools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subdomain: text("subdomain").notNull().unique(),
    name: text("name").notNull(),
    type: schoolType("type").notNull().default("k12"),
    status: schoolStatus("status").notNull().default("trial"),
    tier: tierKey("tier").notNull().default("starter"),
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color").notNull().default("#2F557F"),
    accentColor: text("accent_color").notNull().default("#FFA92D"),
    ownerName: text("owner_name").notNull(),
    ownerEmail: text("owner_email").notNull(),
    ownerMobile: text("owner_mobile"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    onboardingStep: smallint("onboarding_step").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("schools_status_idx").on(t.status)],
);

/* ------------------------------------------------------------------ *
 * Core (every table below carries school_id)
 * ------------------------------------------------------------------ */

export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isMain: boolean("is_main").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const schoolModules = pgTable(
  "school_modules",
  {
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.schoolId, t.moduleKey] })],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    email: text("email"),
    phone: text("phone"),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    status: userStatus("status").notNull().default("active"),
    mfaSecret: text("mfa_secret"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_school_email_uq").on(t.schoolId, t.email),
    index("users_school_idx").on(t.schoolId),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleKey("role").notNull(),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
  },
  (t) => [unique("user_roles_uq").on(t.userId, t.role, t.branchId)],
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: roleKey("role").notNull(),
  token: text("token").notNull().unique(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    studentNumber: text("student_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    activationCode: text("activation_code").notNull(),
    parentCode: text("parent_code").notNull(),
    claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "A student number is unique within a school, not across the platform."
    unique("students_school_number_uq").on(t.schoolId, t.studentNumber),
    index("students_school_idx").on(t.schoolId),
  ],
);

export const studentGuardians = pgTable(
  "student_guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull().default("parent"),
  },
  (t) => [unique("student_guardians_uq").on(t.studentId, t.guardianUserId)],
);

export const schoolYears = pgTable(
  "school_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
  },
  (t) => [unique("school_years_uq").on(t.schoolId, t.name)],
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    level: text("level").notNull(),
    name: text("name").notNull(),
    adviserUserId: uuid("adviser_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [unique("sections_uq").on(t.schoolYearId, t.level, t.name)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("enrollments_uq").on(t.studentId, t.schoolYearId)],
);

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
  },
  (t) => [unique("subjects_uq").on(t.schoolId, t.code)],
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    rows: smallint("rows").notNull().default(5),
    cols: smallint("cols").notNull().default(6),
  },
  (t) => [unique("rooms_uq").on(t.schoolId, t.name)],
);

export const timetableSlots = pgTable(
  "timetable_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    teacherUserId: uuid("teacher_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
    /** 1 = Monday … 7 = Sunday (ISO) */
    weekday: smallint("weekday").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
  },
  (t) => [index("timetable_teacher_idx").on(t.teacherUserId, t.weekday)],
);

/** Saved per room and section, not per teacher. */
export const seatPlans = pgTable(
  "seat_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    /** [{ studentId, row, col }] */
    layout: jsonb("layout").notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("seat_plans_uq").on(t.sectionId, t.roomId)],
);

/* ------------------------------------------------------------------ *
 * Attendance module
 * ------------------------------------------------------------------ */

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    /** Generated on the phone, so retries never create duplicates. */
    id: uuid("id").primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => timetableSlots.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    status: attendanceStatus("status").notNull(),
    note: text("note"),
    markedByUserId: uuid("marked_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Client clock; "the latest timestamp wins". */
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("attendance_slot_student_date_uq").on(t.slotId, t.studentId, t.onDate),
    index("attendance_school_date_idx").on(t.schoolId, t.onDate),
  ],
);

/* ------------------------------------------------------------------ *
 * Platform billing (your billing of schools)
 * ------------------------------------------------------------------ */

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  tier: tierKey("tier").notNull(),
  /** Extra modules bought on top of the tier. */
  extraModules: jsonb("extra_modules").notNull().default(sql`'[]'::jsonb`),
  platformFeeCentavos: integer("platform_fee_centavos").notNull(),
  perStudentCentavos: integer("per_student_centavos").notNull().default(2000),
  startedOn: date("started_on").notNull(),
  endsOn: date("ends_on"),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    /** YYYY-MM — the month this invoice covers. */
    period: text("period").notNull(),
    studentCount: integer("student_count").notNull(),
    platformFeeCentavos: integer("platform_fee_centavos").notNull(),
    studentFeeCentavos: integer("student_fee_centavos").notNull(),
    totalCentavos: integer("total_centavos").notNull(),
    status: invoiceStatus("status").notNull().default("issued"),
    dueOn: date("due_on").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("invoices_school_period_uq").on(t.schoolId, t.period)],
);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  amountCentavos: integer("amount_centavos").notNull(),
  method: text("method").notNull().default("bank_transfer"),
  reference: text("reference"),
  recordedByAdminId: uuid("recorded_by_admin_id").references(() => platformAdmins.id, {
    onDelete: "set null",
  }),
  paidOn: date("paid_on").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Cross-cutting: sessions, audit log, event queue
 * ------------------------------------------------------------------ */

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    /** Null for a platform admin session. */
    schoolId: uuid("school_id").references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    platformAdminId: uuid("platform_admin_id").references(() => platformAdmins.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id").references(() => schools.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_school_at_idx").on(t.schoolId, t.at)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_unprocessed_idx").on(t.schoolId, t.processedAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("inapp"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

/* ------------------------------------------------------------------ *
 * Relations used by query helpers
 * ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many, one }) => ({
  roles: many(userRoles),
  school: one(schools, { fields: [users.schoolId], references: [schools.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
}));

export const studentsRelations = relations(students, ({ many }) => ({
  enrollments: many(enrollments),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  student: one(students, { fields: [enrollments.studentId], references: [students.id] }),
  section: one(sections, { fields: [enrollments.sectionId], references: [sections.id] }),
}));

/* ------------------------------------------------------------------ *
 * Registration and outbound messages
 * ------------------------------------------------------------------ */

/** Proves the owner's email before a school row is created. */
export const emailVerifications = pgTable("email_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Everything the platform would send out. A real SMS gateway and mail provider
 * drop in behind `deliver()`; until then this table is the outbox, and it is
 * also what the "parents get an alert" check reads.
 */
export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id").references(() => schools.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbound_school_idx").on(t.schoolId, t.sentAt)],
);

/* ================================================================== *
 * Grades
 * ================================================================== */

export const gradingPeriods = pgTable(
  "grading_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 1..n, the order they run in. */
    sequence: smallint("sequence").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [unique("grading_periods_uq").on(t.schoolYearId, t.sequence)],
);

/**
 * One score per student, per subject, per period. A school enters a final
 * figure for the period rather than every quiz, which is what the DepEd
 * report card actually carries.
 */
export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    gradingPeriodId: uuid("grading_period_id")
      .notNull()
      .references(() => gradingPeriods.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    /** 0–100, as Philippine schools report it. */
    score: integer("score").notNull(),
    remarks: text("remarks"),
    enteredByUserId: uuid("entered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("scores_uq").on(t.gradingPeriodId, t.studentId, t.subjectId),
    index("scores_student_idx").on(t.schoolId, t.studentId),
  ],
);

/* ================================================================== *
 * Parent and student portal
 * ================================================================== */

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Null = the whole school. */
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    postedByUserId: uuid("posted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_school_idx").on(t.schoolId, t.postedAt)],
);

/* ================================================================== *
 * Discipline
 * ================================================================== */

export const offenseSeverity = pgEnum("offense_severity", ["minor", "major", "grave"]);

export const incidentStatus = pgEnum("incident_status", [
  "reported",
  "under_review",
  "resolved",
]);

export const sanctionKind = pgEnum("sanction_kind", [
  "warning",
  "community_service",
  "detention",
  "suspension",
  "referral",
]);

export const offenseLevels = pgTable(
  "offense_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    severity: offenseSeverity("severity").notNull().default("minor"),
    description: text("description"),
  },
  (t) => [unique("offense_levels_uq").on(t.schoolId, t.name)],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    offenseLevelId: uuid("offense_level_id").references(() => offenseLevels.id, {
      onDelete: "set null",
    }),
    onDate: date("on_date").notNull(),
    summary: text("summary").notNull(),
    status: incidentStatus("status").notNull().default("reported"),
    /** A teacher sees only the reports they filed. */
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("incidents_student_idx").on(t.schoolId, t.studentId)],
);

export const sanctions = pgTable("sanctions", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  incidentId: uuid("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  kind: sanctionKind("kind").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  note: text("note"),
  issuedByUserId: uuid("issued_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ================================================================== *
 * Guidance — the confidential office
 * ================================================================== */

export const caseStatus = pgEnum("case_status", ["open", "monitoring", "closed"]);

export const guidanceCases = pgTable(
  "guidance_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: caseStatus("status").notNull().default("open"),
    /** Where it came from: a referral, an attendance flag, a walk-in. */
    source: text("source").notNull().default("walk_in"),
    openedByUserId: uuid("opened_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("guidance_cases_idx").on(t.schoolId, t.status)],
);

export const caseNotes = pgTable("case_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  caseId: uuid("case_id")
    .notNull()
    .references(() => guidanceCases.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  caseId: uuid("case_id")
    .notNull()
    .references(() => guidanceCases.id, { onDelete: "cascade" }),
  onDate: date("on_date").notNull(),
  atTime: time("at_time").notNull(),
  note: text("note"),
  attended: boolean("attended"),
});

/* ================================================================== *
 * SAO and Chaplain — clubs, events, service hours
 * ================================================================== */

export const clubs = pgTable(
  "clubs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    moderatorUserId: uuid("moderator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [unique("clubs_uq").on(t.schoolId, t.name)],
);

export const clubMemberships = pgTable(
  "club_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
  },
  (t) => [unique("club_memberships_uq").on(t.clubId, t.studentId)],
);

export const activityKind = pgEnum("activity_kind", ["sao_event", "ministry"]);

/** SAO events and Chaplain's ministry activities are the same shape. */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    kind: activityKind("kind").notNull(),
    name: text("name").notNull(),
    onDate: date("on_date").notNull(),
    location: text("location"),
    /** Hours each attending student is credited with. */
    serviceHours: integer("service_hours").notNull().default(0),
    organizedByUserId: uuid("organized_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("activities_idx").on(t.schoolId, t.kind, t.onDate)],
);

export const serviceHours = pgTable(
  "service_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    hours: integer("hours").notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("service_hours_uq").on(t.activityId, t.studentId)],
);

/* ================================================================== *
 * Billing — the school's own fees, not the platform's
 * ================================================================== */

export const feeItems = pgTable(
  "fee_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amountCentavos: integer("amount_centavos").notNull(),
    /** Null = every level. */
    level: text("level"),
    dueOn: date("due_on"),
  },
  (t) => [unique("fee_items_uq").on(t.schoolYearId, t.name, t.level)],
);

export const studentCharges = pgTable(
  "student_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    feeItemId: uuid("fee_item_id")
      .notNull()
      .references(() => feeItems.id, { onDelete: "cascade" }),
    amountCentavos: integer("amount_centavos").notNull(),
    chargedOn: date("charged_on").notNull(),
  },
  (t) => [unique("student_charges_uq").on(t.studentId, t.feeItemId)],
);

export const studentPayments = pgTable("student_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  amountCentavos: integer("amount_centavos").notNull(),
  method: text("method").notNull().default("cash"),
  reference: text("reference"),
  receiptNo: text("receipt_no").notNull(),
  receivedByUserId: uuid("received_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  paidOn: date("paid_on").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ================================================================== *
 * Registrar
 * ================================================================== */

export const requestKind = pgEnum("request_kind", [
  "enrollment",
  "transfer_out",
  "certificate",
  "transcript",
]);

export const requestStatus = pgEnum("request_status", [
  "requested",
  "on_hold",
  "cleared",
  "released",
  "declined",
]);

export const registrarRequests = pgTable(
  "registrar_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    kind: requestKind("kind").notNull(),
    status: requestStatus("status").notNull().default("requested"),
    purpose: text("purpose"),
    /** Why clearance failed, when it did. */
    holdReason: text("hold_reason"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    handledByUserId: uuid("handled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("registrar_requests_idx").on(t.schoolId, t.status)],
);
