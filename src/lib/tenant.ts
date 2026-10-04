import { and, eq } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { schoolModules, schools } from "@/db/schema";
import { modulesForTier } from "./pricing";
import { MODULES, type ModuleKey } from "./modules";

export type School = typeof schools.$inferSelect;

const RESERVED_SUBDOMAINS = new Set([
  "admin",
  "www",
  "api",
  "app",
  "mail",
  "static",
  "assets",
  "status",
  "help",
  "support",
  "blog",
  "docs",
  "login",
  "signup",
]);

export function subdomainProblem(value: string): string | null {
  const s = value.trim().toLowerCase();
  if (s.length < 3) return "Use at least 3 characters.";
  if (s.length > 40) return "Use at most 40 characters.";
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s))
    return "Use lowercase letters, numbers and hyphens only.";
  if (RESERVED_SUBDOMAINS.has(s)) return "That address is reserved.";
  return null;
}

export async function findSchoolBySubdomain(subdomain: string) {
  const [row] = await db
    .select()
    .from(schools)
    .where(eq(schools.subdomain, subdomain.toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function subdomainAvailable(subdomain: string) {
  if (subdomainProblem(subdomain)) return false;
  return (await findSchoolBySubdomain(subdomain)) === null;
}

/** Which modules a school has switched on, core always included. */
export async function enabledModules(schoolId: string): Promise<Set<ModuleKey>> {
  const rows = await withTenant(schoolId, (tx) =>
    tx
      .select()
      .from(schoolModules)
      .where(and(eq(schoolModules.schoolId, schoolId), eq(schoolModules.enabled, true))),
  );
  const out = new Set<ModuleKey>(["core"]);
  for (const r of rows) if (r.moduleKey in MODULES) out.add(r.moduleKey as ModuleKey);
  return out;
}

/** Switch on exactly the modules a tier includes, keeping any extras bought. */
export async function applyTierModules(
  schoolId: string,
  tier: (typeof schools.$inferSelect)["tier"],
  extras: ModuleKey[] = [],
) {
  const wanted = new Set<ModuleKey>([...modulesForTier(tier), ...extras]);
  await withTenant(schoolId, async (tx) => {
    for (const key of Object.keys(MODULES) as ModuleKey[]) {
      const enabled = wanted.has(key) || MODULES[key].alwaysOn === true;
      await tx
        .insert(schoolModules)
        .values({
          schoolId,
          moduleKey: key,
          enabled,
          enabledAt: enabled ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [schoolModules.schoolId, schoolModules.moduleKey],
          // "The screens hide and the data stays."
          set: { enabled, enabledAt: enabled ? new Date() : null },
        });
    }
  });
}
