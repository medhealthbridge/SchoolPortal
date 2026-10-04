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
  /** Core is always on and cannot be switched off. */
  alwaysOn?: boolean;
  owns: string[];
  emits: string[];
  listensTo: string[];
  /** Yearly price in centavos, behind the tiers. */
  priceCentavos: number;
};

export const MODULES: Record<ModuleKey, ModuleDefinition> = {
  core: {
    key: "core",
    name: "Core",
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
    owns: ["timetable_slots", "seat_plans", "attendance_records"],
    emits: ["student.marked_late", "student.marked_absent", "student.absence_streak"],
    listensTo: ["discipline.suspension_started"],
    priceCentavos: 1_000_000,
  },
  grades: {
    key: "grades",
    name: "Grades",
    owns: ["scores", "grading_periods", "report_cards"],
    emits: ["grade.period_closed", "student.failing"],
    listensTo: ["student.marked_absent", "sao.service_hours_logged"],
    priceCentavos: 1_500_000,
  },
  portal: {
    key: "portal",
    name: "Parent and student portal",
    owns: ["announcements", "portal_alerts"],
    emits: [],
    listensTo: ["student.marked_absent", "grade.period_closed", "billing.balance_changed"],
    priceCentavos: 1_000_000,
  },
  discipline: {
    key: "discipline",
    name: "Discipline",
    owns: ["incidents", "offense_levels", "sanctions"],
    emits: ["discipline.suspension_started", "discipline.repeat_case"],
    listensTo: ["student.marked_late"],
    priceCentavos: 600_000,
  },
  guidance: {
    key: "guidance",
    name: "Guidance",
    owns: ["guidance_cases", "referrals", "appointments"],
    emits: [],
    listensTo: ["student.absence_streak", "student.failing", "discipline.repeat_case"],
    priceCentavos: 600_000,
  },
  registrar: {
    key: "registrar",
    name: "Registrar",
    owns: ["enrollment_requests", "transfers", "transcripts", "certificates"],
    emits: ["registrar.clearance_requested"],
    listensTo: ["billing.hold_placed"],
    priceCentavos: 1_000_000,
  },
  billing: {
    key: "billing",
    name: "Billing",
    owns: ["fees", "payment_plans", "receipts", "balances"],
    emits: ["billing.balance_changed", "billing.hold_placed"],
    listensTo: ["student.enrolled"],
    priceCentavos: 1_500_000,
  },
  sao: {
    key: "sao",
    name: "SAO",
    owns: ["clubs", "school_events", "elections", "student_ids"],
    emits: ["sao.service_hours_logged"],
    listensTo: [],
    priceCentavos: 500_000,
  },
  chaplain: {
    key: "chaplain",
    name: "Chaplain",
    owns: ["ministry_activities", "formation_records"],
    emits: ["sao.service_hours_logged"],
    listensTo: [],
    priceCentavos: 300_000,
  },
  analytics: {
    key: "analytics",
    name: "Analytics",
    owns: ["dashboard_snapshots"],
    emits: [],
    listensTo: ["*"],
    priceCentavos: 500_000,
  },
};

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

export function isModuleKey(value: string): value is ModuleKey {
  return value in MODULES;
}
