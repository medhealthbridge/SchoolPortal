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
  | "discipline.manage"
  | "guidance.manage"
  | "sao.manage"
  | "chaplain.manage"
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
    "reports.view",
    "audit.view",
  ],
  principal: ["students.view", "attendance.view_all", "reports.view", "audit.view"],
  registrar: ["students.manage", "students.view", "sections.manage", "reports.view"],
  teacher: ["attendance.take", "students.view", "reports.view"],
  adviser: ["attendance.take", "attendance.view_all", "students.view", "reports.view"],
  discipline_officer: ["discipline.manage", "students.view", "attendance.view_all"],
  guidance_counselor: ["guidance.manage", "students.view"],
  sao_staff: ["sao.manage", "students.view"],
  chaplain: ["chaplain.manage", "students.view"],
  accounting: ["accounting.manage", "students.view", "school.billing.view"],
  parent: ["attendance.view_own_children"],
  student: ["attendance.view_own"],
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
  "discipline.manage": "discipline",
  "guidance.manage": "guidance",
  "sao.manage": "sao",
  "chaplain.manage": "chaplain",
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
