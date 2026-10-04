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
