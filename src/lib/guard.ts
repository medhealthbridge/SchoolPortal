import { notFound, redirect } from "next/navigation";
import { enabledModules } from "./tenant";
import { getAdminSession, getSchoolSession, currentSchool } from "./session";
import { PERMISSION_MODULE, can, type Permission } from "./roles";
import type { ModuleKey } from "./modules";

export class AccessError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Every action is checked in this order: school active, module switched on,
 * role allowed. The same gate runs for pages and for API routes, so hiding a
 * menu item is never what keeps someone out.
 */
export async function requireSchool() {
  const school = await currentSchool();
  if (!school) notFound();
  if (school.status === "suspended") redirect("/on-hold");
  return school;
}

export async function requireUser() {
  const school = await requireSchool();
  const session = await getSchoolSession();
  if (!session) redirect("/login");
  if (session.schoolId !== school.id) redirect("/login");
  return { school, session };
}

export async function requireModule(key: ModuleKey) {
  const school = await requireSchool();
  const on = await enabledModules(school.id);
  if (!on.has(key)) notFound();
  return school;
}

export async function requirePermission(permission: Permission) {
  const { school, session } = await requireUser();
  const moduleKey = PERMISSION_MODULE[permission];
  if (moduleKey) {
    const on = await enabledModules(school.id);
    if (!on.has(moduleKey)) notFound();
  }
  if (!can(session.roles, permission)) notFound();
  return { school, session };
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return session;
}

/** API-route flavour: throws instead of redirecting, so routes can answer with JSON. */
export async function apiRequirePermission(permission: Permission) {
  const school = await currentSchool();
  if (!school) throw new AccessError(404, "Unknown school");
  if (school.status === "suspended") throw new AccessError(403, "Account on hold");

  const session = await getSchoolSession();
  if (!session || session.schoolId !== school.id)
    throw new AccessError(401, "Sign in first");

  const moduleKey = PERMISSION_MODULE[permission];
  if (moduleKey) {
    const on = await enabledModules(school.id);
    if (!on.has(moduleKey)) throw new AccessError(404, "Module is switched off");
  }
  if (!can(session.roles, permission)) throw new AccessError(403, "Not allowed");
  return { school, session };
}
