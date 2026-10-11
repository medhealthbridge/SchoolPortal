"use server";

import { revalidatePath } from "next/cache";

import { withTenant } from "@/db";
import { schoolModules } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { MODULES, isModuleKey } from "@/lib/modules";
import { modulesForTier } from "@/lib/pricing";

/**
 * Switching a module off hides its screens and keeps its data; switching it
 * back on restores everything, and from that day its listeners start running.
 */
export async function toggleModule(formData: FormData) {
  const { school, session } = await requirePermission("school.manage");
  const key = String(formData.get("moduleKey") ?? "");
  const enable = formData.get("enable") === "1";
  if (!isModuleKey(key) || MODULES[key].alwaysOn) return;

  // A module outside the tier is an extra the school is paying for; the
  // platform admin is the one who adds those.
  if (enable && !modulesForTier(school.tier).includes(key)) return;

  await withTenant(school.id, async (tx) => {
    await tx
      .insert(schoolModules)
      .values({
        schoolId: school.id,
        moduleKey: key,
        enabled: enable,
        enabledAt: enable ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [schoolModules.schoolId, schoolModules.moduleKey],
        set: { enabled: enable, enabledAt: enable ? new Date() : null },
      });
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: enable ? "module.enabled" : "module.disabled",
      entity: "school_modules",
      entityId: key,
      after: { moduleKey: key, enabled: enable },
    });
  });

  revalidatePath("/modules");
}
