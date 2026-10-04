import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolModules } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { TIERS, peso } from "@/lib/pricing";
import { Card, Table } from "@/components/ui";
import { toggleModule } from "./actions";

export const metadata = { title: "Modules" };

export default async function ModulesPage() {
  const { school } = await requirePermission("school.manage");
  const rows = await withTenant(school.id, (tx) =>
    tx.select().from(schoolModules).where(eq(schoolModules.schoolId, school.id)),
  );
  const state = new Map(rows.map((r) => [r.moduleKey, r.enabled]));
  const inTier = new Set(TIERS[school.tier].modules);

  return (
    <div className="grid gap-5">
      <Card
        title="Modules"
        subtitle={`${TIERS[school.tier].name} tier · ${peso(TIERS[school.tier].platformFeeCentavos)} per year`}
      >
        <Table head={["Module", "In your tier", "State", ""]}>
          {MODULE_KEYS.map((key) => {
            const m = MODULES[key];
            const on = m.alwaysOn || state.get(key) === true;
            const available = m.alwaysOn || inTier.has(key);
            return (
              <tr key={key}>
                <td className="py-2 pr-4">
                  <span className="font-medium">{m.name}</span>
                  <span className="block text-xs text-black/55 dark:text-white/55">
                    {m.emits.length > 0 ? `Emits ${m.emits.join(", ")}` : "Emits nothing"}
                  </span>
                </td>
                <td className="py-2 pr-4">{available ? "Yes" : `+${peso(m.priceCentavos)}/yr`}</td>
                <td className="py-2 pr-4">
                  {m.alwaysOn ? "Always on" : on ? "On" : "Off"}
                </td>
                <td className="py-2 pr-4">
                  {!m.alwaysOn && available && (
                    <form action={toggleModule}>
                      <input type="hidden" name="moduleKey" value={key} />
                      <input type="hidden" name="enable" value={on ? "0" : "1"} />
                      <button className="rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/20">
                        {on ? "Switch off" : "Switch on"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-4 text-xs text-black/55 dark:text-white/55">
          Switching a module off hides its screens and keeps its data. Modules
          outside your tier are added by the platform admin when you upgrade.
        </p>
      </Card>
    </div>
  );
}
