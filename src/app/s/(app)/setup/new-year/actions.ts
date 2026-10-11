"use server";

import { revalidatePath } from "next/cache";
import { withTenant } from "@/db";
import { requirePermission } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { applyRollover, type Outcome } from "@/lib/rollover";

export type RolloverResult = { ok?: string; error?: string } | null;

export async function startNextYear(_prev: RolloverResult, form: FormData): Promise<RolloverResult> {
  const { school, session } = await requirePermission("sections.manage");
  const name = String(form.get("name") ?? "").trim();
  const startsOn = String(form.get("startsOn") ?? "");
  const endsOn = String(form.get("endsOn") ?? "");
  if (form.get("confirm") !== "yes") return { error: "Tick the box to confirm." };
  if (!name || !startsOn || !endsOn) return { error: "Fill in the new year's name, start and end." };
  if (endsOn <= startsOn) return { error: "The year has to end after it starts." };

  const overrides = new Map<string, Outcome>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("outcome:")) continue;
    const v = String(value);
    if (v === "promoted" || v === "retained" || v === "graduated") overrides.set(key.slice(8), v);
  }

  const out = await withTenant(school.id, async (tx) => {
    const done = await applyRollover(tx, school.id, { name, startsOn, endsOn, overrides });
    if ("error" in done) return { error: done.error };
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "school_year.rolled_over",
      entity: "school_years",
      entityId: done.year.id,
      after: { name, ...done.counts },
    });
    const c = done.counts;
    return {
      ok: `${name} has started: ${c.promoted} promoted, ${c.retained} kept at their level, ${c.graduated} graduated, in ${done.sections} sections. Build the new schedule next.`,
    };
  });
  revalidatePath("/setup");
  revalidatePath("/setup/new-year");
  return out;
}
