import type { ModuleKey } from "./modules";

export type Role =
  | "school_admin"
  | "principal"
  | "registrar"
  | "teacher"
  | "adviser"
  | "discipline_officer"
  | "guidance_counselor"
  | "sao_staff"
  | "chaplain"
  | "accounting"
  | "parent"
  | "student";

export const ROLE_LABELS: Record<Role, string> = {
  school_admin: "School admin (owner)",
  principal: "Principal",
  registrar: "Registrar",
  teacher: "Teacher",
  adviser: "Adviser",
  discipline_officer: "Discipline officer",
  guidance_counselor: "Guidance counselor",
  sao_staff: "SAO staff",
  chaplain: "Chaplain",
  accounting: "Accounting",
  parent: "Parent",
  student: "Student",
};

export const ROLE_SCOPES: Record<Role, string> = {
  school_admin: "One school: setup, users, modules, subscription",
  principal: "Dashboards, approvals, all academic data",
  registrar: "Student records, enrollment, sections",
  teacher: "Own classes: attendance, grades, incident reports",
  adviser: "Teacher rights plus the whole advisory section",
  discipline_officer: "Discipline cases and sanctions",
  guidance_counselor: "Confidential cases",
  sao_staff: "Clubs, events, student IDs",
  chaplain: "Ministry activities and service hours",
  accounting: "Fees, payments, receipts",
  parent: "Own children only, read-only",
  student: "Own record only, read-only",
};

/**
 * Permissions are checked on the server for every request, not only hidden in
 * the menu. A permission names what is being done; a role holds a set of them.
 */
export type Permission =
  | "school.manage"
  | "school.billing.view"
  | "users.manage"
  | "students.manage"
  | "students.view"
  | "sections.manage"
  | "timetable.manage"
  | "attendance.take"
  | "attendance.view_all"
  | "attendance.view_own_children"
  | "attendance.view_own"
  | "reports.view"
  | "grades.enter"
  | "grades.view_all"
  | "grades.view_own"
  | "grades.manage_periods"
  | "portal.post"
  | "discipline.report"
  | "discipline.manage"
  | "guidance.manage"
  | "sao.manage"
  | "chaplain.manage"
  | "registrar.manage"
  | "fees.manage"
  | "fees.view_own"
  | "analytics.view"
  | "accounting.manage"
  | "audit.view";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  school_admin: [
    "school.manage",
    "school.billing.view",
    "users.manage",
    "students.manage",
    "students.view",
    "sections.manage",
    "timetable.manage",
    "attendance.view_all",
    "grades.view_all",
    "grades.manage_periods",
    "portal.post",
    "registrar.manage",
    "fees.manage",
    "analytics.view",
    "reports.view",
    "audit.view",
  ],
  principal: [
    "students.view",
    "attendance.view_all",
    "grades.view_all",
    "analytics.view",
    "portal.post",
    "reports.view",
    "audit.view",
  ],
  registrar: [
    "students.manage",
    "students.view",
    "sections.manage",
    "registrar.manage",
    "grades.view_all",
    "reports.view",
  ],
  teacher: [
    "attendance.take",
    "grades.enter",
    "discipline.report",
    "students.view",
    "reports.view",
  ],
  adviser: [
    "attendance.take",
    "attendance.view_all",
    "grades.enter",
    "grades.view_all",
    "discipline.report",
    "students.view",
    "reports.view",
  ],
  discipline_officer: [
    "discipline.manage",
    "discipline.report",
    "students.view",
    "attendance.view_all",
  ],
  guidance_counselor: ["guidance.manage", "students.view"],
  sao_staff: ["sao.manage", "students.view"],
  chaplain: ["chaplain.manage", "students.view"],
  accounting: ["accounting.manage", "fees.manage", "students.view", "school.billing.view"],
  parent: ["attendance.view_own_children", "grades.view_own", "fees.view_own"],
  student: ["attendance.view_own", "grades.view_own", "fees.view_own"],
};

export function permissionsFor(roles: Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role]) out.add(p);
  return out;
}

export function can(roles: Role[], permission: Permission) {
  return permissionsFor(roles).has(permission);
}

/** Which module a permission belongs to, so a switched-off module 404s. */
export const PERMISSION_MODULE: Partial<Record<Permission, ModuleKey>> = {
  "attendance.take": "attendance",
  "attendance.view_all": "attendance",
  "attendance.view_own_children": "attendance",
  "attendance.view_own": "attendance",
  "grades.enter": "grades",
  "grades.view_all": "grades",
  "grades.view_own": "grades",
  "grades.manage_periods": "grades",
  "portal.post": "portal",
  "discipline.report": "discipline",
  "discipline.manage": "discipline",
  "guidance.manage": "guidance",
  "sao.manage": "sao",
  "chaplain.manage": "chaplain",
  "registrar.manage": "registrar",
  "fees.manage": "billing",
  "fees.view_own": "billing",
  "analytics.view": "analytics",
  "accounting.manage": "billing",
};

export const STAFF_ROLES: Role[] = [
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
];
