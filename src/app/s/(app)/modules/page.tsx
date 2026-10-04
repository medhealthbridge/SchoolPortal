import Link from "next/link";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolModules } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import { TIERS, peso } from "@/lib/pricing";
import { Section, Table } from "@/components/ui";
import { toggleModule } from "./actions";

export const metadata = { title: "Modules" };

/** Said the way a school admin would say it, not the way the event is named. */
const LINK_WORDS: Record<string, string> = {
  "student.marked_late": "late marks",
  "student.marked_absent": "absences",
  "student.absence_streak": "absence streaks",
  "student.enrolled": "new enrolments",
  "student.transferred": "transfers",
  "user.invited": "new staff accounts",
  "student.failing": "failing grades",
  "grade.period_closed": "closed grading periods",
  "discipline.suspension_started": "suspensions",
  "discipline.repeat_case": "repeat cases",
  "billing.balance_changed": "balance changes",
  "billing.hold_placed": "clearance holds",
  "sao.service_hours_logged": "service hours",
  "registrar.clearance_requested": "clearance requests",
};

export default async function ModulesPage() {
  const { school } = await requirePermission("school.manage");
  const rows = await withTenant(school.id, (tx) =>
    tx.select().from(schoolModules).where(eq(schoolModules.schoolId, school.id)),
  );
  const state = new Map(rows.map((r) => [r.moduleKey, r.enabled]));
  const inTier = new Set(TIERS[school.tier].modules);
  const isOn = (k: ModuleKey) => MODULES[k].alwaysOn === true || state.get(k) === true;

  /* Every pair where one module sends something the other listens for.
     Analytics listens to everything, which would be a row per event, so it is
     stated once underneath instead. */
  const links = MODULE_KEYS.flatMap((from) =>
    MODULES[from].emits.flatMap((event) =>
      MODULE_KEYS.filter((to) => to !== from && MODULES[to].listensTo.includes(event)).map(
        (to) => ({ from, to, event }),
      ),
    ),
  );
  const readsEverything = MODULE_KEYS.filter((k) => MODULES[k].listensTo.includes("*"));
  const liveLinks = links.filter((l) => isOn(l.from) && isOn(l.to));
  const dormantLinks = links.filter((l) => !(isOn(l.from) && isOn(l.to)));

  return (
    <>
      <Section
        title="Modules"
        subtitle={`On the ${TIERS[school.tier].name} tier, ${peso(TIERS[school.tier].platformFeeCentavos)} a year. Switching one off hides its screens and keeps every record it holds.`}
      >
        <Table head={["Module", "In your tier", "State", ""]}>
          {MODULE_KEYS.map((key) => {
            const m = MODULES[key];
            const on = isOn(key);
            const available = m.alwaysOn || inTier.has(key);
            return (
              <tr key={key}>
                <th scope="row" className="py-2.5 pr-5 text-left">
                  <span className="font-medium">{m.name}</span>
                  <span className="mt-0.5 block max-w-[46ch] text-[0.8125rem] font-normal text-[var(--ink-soft)]">
                    {m.summary}
                  </span>
                </th>
                <td className="py-2.5 pr-5">
                  {available ? "Yes" : `${peso(m.priceCentavos)} a year`}
                </td>
                <td className="py-2.5 pr-5">
                  <span
                    className="inline-block border-l-2 pl-2 font-medium"
                    style={{
                      borderColor: on ? "var(--color-present)" : "var(--rule)",
                      color: on ? "var(--color-present)" : "var(--ink-faint)",
                    }}
                  >
                    {m.alwaysOn ? "Always on" : on ? "On" : "Off"}
                  </span>
                </td>
                <td className="py-2.5 pr-5">
                  {!m.alwaysOn && available && (
                    <form action={toggleModule}>
                      <input type="hidden" name="moduleKey" value={key} />
                      <input type="hidden" name="enable" value={on ? "0" : "1"} />
                      <button className="whitespace-nowrap rounded-[2px] border border-[var(--ink-soft)] px-2.5 py-1 text-[0.8125rem] hover:bg-[var(--paper-sunken)]">
                        {on ? "Switch off" : "Switch on"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-4 max-w-[70ch] text-sm text-[var(--ink-soft)]">
          Modules outside your tier come with an upgrade. Your plan and what it
          costs are on{" "}
          <Link href="/billing" className="font-medium text-[var(--brand)] underline underline-offset-2">
            Billing
          </Link>
          .
        </p>
      </Section>

      <Section
        title="What they tell each other"
        subtitle="No module reads another one's records. They pass these along instead, and a link only runs while both ends are on."
      >
        <ul className="ledger-rows">
          {[...liveLinks, ...dormantLinks].map((l) => {
            const live = isOn(l.from) && isOn(l.to);
            return (
              <li
                key={`${l.from}-${l.to}-${l.event}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2.5 text-sm"
              >
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 translate-y-[1px]"
                  style={{ backgroundColor: live ? "var(--color-present)" : "var(--rule)" }}
                />
                <span className={live ? "font-medium" : "text-[var(--ink-faint)]"}>
                  {MODULES[l.from].name}
                </span>
                <span className={live ? "text-[var(--ink-soft)]" : "text-[var(--ink-faint)]"}>
                  sends {LINK_WORDS[l.event] ?? l.event} to
                </span>
                <span className={live ? "font-medium" : "text-[var(--ink-faint)]"}>
                  {MODULES[l.to].name}
                </span>
                {!live && (
                  <span className="text-[var(--ink-faint)]">
                    (waiting on {isOn(l.from) ? MODULES[l.to].name : MODULES[l.from].name})
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {readsEverything.length > 0 && (
          <p className="mt-4 max-w-[70ch] text-sm text-[var(--ink-soft)]">
            {readsEverything.map((k) => MODULES[k].name).join(" and ")} reads
            everything the other modules send, so its dashboards cover whichever
            of them are on.
          </p>
        )}
      </Section>
    </>
  );
}
