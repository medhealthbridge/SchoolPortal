import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db, homeOf, withTenant } from "@/db";
import { platformAdmins, schools, sessions, userRoles, users } from "@/db/schema";
import type { Role } from "./roles";

export const SCHOOL_COOKIE = "sp_session";
export const ADMIN_COOKIE = "sp_admin";
const DAYS = 14;

function newSessionId() {
  return randomBytes(32).toString("base64url");
}

export async function createSchoolSession(userId: string, schoolId: string) {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + DAYS * 86_400_000);
  // In the school's own database when it has one: the row points at the user.
  await (await homeOf(schoolId)).insert(sessions).values({ id, userId, schoolId, expiresAt });
  const jar = await cookies();
  jar.set(SCHOOL_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return id;
}

export async function createAdminSession(platformAdminId: string) {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + DAYS * 86_400_000);
  await db.insert(sessions).values({ id, platformAdminId, expiresAt });
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return id;
}

export async function destroySession(cookieName: string) {
  const jar = await cookies();
  const id = jar.get(cookieName)?.value;
  if (id) {
    const school = cookieName === SCHOOL_COOKIE ? await currentSchool() : null;
    const where = school ? await homeOf(school.id) : db;
    await where.delete(sessions).where(eq(sessions.id, id));
  }
  jar.delete(cookieName);
}

/** Signs a person out everywhere: after a password change, or a disabled account. */
export async function endSessionsOf(schoolId: string, userId: string) {
  await (await homeOf(schoolId)).delete(sessions).where(eq(sessions.userId, userId));
}

export type SchoolSession = {
  sessionId: string;
  userId: string;
  schoolId: string;
  name: string;
  email: string | null;
  roles: Role[];
  /** The version of the school's privacy notice this person last accepted. */
  privacyConsentVersion: number | null;
};

/**
 * Reads the session and the roles fresh on every request, so a role change or
 * a disabled account takes effect at once rather than at the next login.
 */
export async function getSchoolSession(): Promise<SchoolSession | null> {
  const jar = await cookies();
  const id = jar.get(SCHOOL_COOKIE)?.value;
  if (!id) return null;
  const school = await currentSchool();
  if (!school) return null;

  // `sessions` carries no row-level security: it is read before the user is
  // known. It is read from this school's own database, and must name this
  // school; everything after it is read inside that school's tenant context.
  const [row] = await (await homeOf(school.id))
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.schoolId, school.id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row?.schoolId || !row.userId) return null;

  return withTenant(row.schoolId, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, row.userId!)).limit(1);
    if (!user || user.status !== "active") return null;

    const roleRows = await tx
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));

    return {
      sessionId: id,
      userId: user.id,
      schoolId: row.schoolId!,
      name: user.name,
      email: user.email,
      roles: roleRows.map((r) => r.role as Role),
      privacyConsentVersion: user.privacyConsentVersion,
    } satisfies SchoolSession;
  });
}

export type AdminSession = { sessionId: string; adminId: string; name: string; email: string };

export async function getAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const id = jar.get(ADMIN_COOKIE)?.value;
  if (!id) return null;
  const [row] = await db
    .select({ session: sessions, admin: platformAdmins })
    .from(sessions)
    .innerJoin(platformAdmins, eq(platformAdmins.id, sessions.platformAdminId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  return {
    sessionId: id,
    adminId: row.admin.id,
    name: row.admin.name,
    email: row.admin.email,
  };
}

/** The subdomain middleware resolved for this request. */
export async function currentSubdomain() {
  const h = await headers();
  return h.get("x-school-subdomain");
}

export async function currentSchool() {
  const sub = await currentSubdomain();
  if (!sub) return null;
  const [row] = await db.select().from(schools).where(eq(schools.subdomain, sub)).limit(1);
  return row ?? null;
}
