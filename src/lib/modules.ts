/**
 * The module registry. Every module declares its key, what it owns, the events
 * it emits and the events it listens to. A module may read core tables and its
 * own tables, never another module's — the links below are the only seam.
 */
export type ModuleKey =
  | "core"
  | "attendance"
  | "grades"
  | "portal"
  | "discipline"
  | "guidance"
  | "registrar"
  | "billing"
  | "sao"
  | "chaplain"
  | "analytics";

export type ModuleDefinition = {
  key: ModuleKey;
  name: string;
  /** What it does, in the words a school would use. Table names are not it. */
  summary: string;
  /** Core is always on and cannot be switched off. */
  alwaysOn?: boolean;
  owns: string[];
  emits: string[];
  listensTo: string[];
  /** The tables it writes. Core's tables are readable by every module; these
   *  are not — another module reaches them only through an event. */
  priceCentavos: number;
};

export const MODULES: Record<ModuleKey, ModuleDefinition> = {
  core: {
    key: "core",
    name: "Core",
    summary: "Your school, its branches, every person in it, and the student record that everything else hangs on.",
    alwaysOn: true,
    owns: [
      "schools",
      "branches",
      "users",
      "user_roles",
      "students",
      "sections",
      "school_years",
      "audit_log",
      "notifications",
    ],
    emits: ["student.enrolled", "student.transferred", "user.invited"],
    listensTo: [],
    priceCentavos: 1_500_000,
  },
  attendance: {
    key: "attendance",
    name: "Attendance",
    summary: "The timetable, a seat plan per room, and the daily register, taken on a phone with or without signal.",
    owns: ["timetable_slots", "seat_plans", "attendance_records"],
    emits: ["student.marked_late", "student.marked_absent", "student.absence_streak"],
    listensTo: ["discipline.suspension_started"],
    priceCentavos: 1_000_000,
  },
  grades: {
    key: "grades",
    name: "Grades",
    summary: "Scores by grading period, and the report card they add up to.",
    owns: ["grading_periods", "scores"],
    emits: ["grade.period_closed", "student.failing"],
    listensTo: ["student.marked_absent", "sao.service_hours_logged"],
    priceCentavos: 1_500_000,
  },
  portal: {
    key: "portal",
    name: "Parent and student portal",
    summary: "What parents and students see: alerts, announcements, and their own records.",
    owns: ["announcements"],
    emits: [],
    listensTo: ["student.marked_absent", "grade.period_closed", "billing.balance_changed"],
    priceCentavos: 1_000_000,
  },
  discipline: {
    key: "discipline",
    name: "Discipline",
    summary: "Incident reports, offence levels, sanctions and the notices that go home.",
    owns: ["incidents", "offense_levels", "sanctions"],
    emits: ["discipline.suspension_started", "discipline.repeat_case"],
    listensTo: ["student.marked_late"],
    priceCentavos: 600_000,
  },
  guidance: {
    key: "guidance",
    name: "Guidance",
    summary: "Confidential cases, referrals and appointments, visible only to the guidance office.",
    owns: ["guidance_cases", "case_notes", "appointments"],
    emits: [],
    listensTo: ["student.absence_streak", "student.failing", "discipline.repeat_case"],
    priceCentavos: 600_000,
  },
  registrar: {
    key: "registrar",
    name: "Registrar",
    summary: "Enrolment, transfers, transcripts and certificates, with clearance before each one.",
    owns: ["registrar_requests"],
    emits: ["registrar.clearance_requested"],
    listensTo: ["billing.hold_placed"],
    priceCentavos: 1_000_000,
  },
  billing: {
    key: "billing",
    name: "Billing",
    summary: "School fees, payment plans, receipts and the balance owing per student.",
    owns: ["fee_items", "student_charges", "student_payments"],
    emits: ["billing.balance_changed", "billing.hold_placed"],
    listensTo: ["student.enrolled"],
    priceCentavos: 1_500_000,
  },
  sao: {
    key: "sao",
    name: "SAO",
    summary: "Clubs, events, elections and student IDs.",
    owns: ["clubs", "club_memberships", "activities", "service_hours"],
    emits: ["sao.service_hours_logged"],
    listensTo: [],
    priceCentavos: 500_000,
  },
  chaplain: {
    key: "chaplain",
    name: "Chaplain",
    summary: "Ministry activities, formation records and service hours.",
    owns: ["activities", "service_hours"],
    emits: ["sao.service_hours_logged"],
    listensTo: [],
    priceCentavos: 300_000,
  },
  analytics: {
    key: "analytics",
    name: "Analytics",
    summary: "The principal\u2019s dashboards, drawn from whichever modules are on.",
    owns: [],
    emits: [],
    listensTo: ["*"],
    priceCentavos: 500_000,
  },
};

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

export function isModuleKey(value: string): value is ModuleKey {
  return value in MODULES;
}
