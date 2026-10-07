import Link from "next/link";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolModules } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import { TIERS, peso } from "@/lib/pricing";
import { PageHeader, Pill, Section, Table } from "@/components/ui";
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
      <PageHeader
        title="Modules"
        meta={`${MODULE_KEYS.filter(isOn).length} of ${MODULE_KEYS.length} switched on, ${liveLinks.length} links running`}
      />

      <Section
        flush
        title="What this school has on"
        subtitle={`On the ${TIERS[school.tier].name} tier, ${peso(TIERS[school.tier].platformFeeCentavos)} a year. Switching one off hides its screens and keeps every record it holds.`}
      >
        <Table
          head={["Module", "In your tier", "State", <span key="a" className="sr-only">Action</span>]}
          minWidth={720}
        >
          {MODULE_KEYS.map((key) => {
            const m = MODULES[key];
            const on = isOn(key);
            const available = m.alwaysOn || inTier.has(key);
            return (
              <tr key={key}>
                <th scope="row" className="text-left">
                  <span className="font-medium">{m.name}</span>
                  <span className="mt-0.5 block max-w-[46ch] text-[13px] font-normal text-muted">
                    {m.summary}
                  </span>
                </th>
                <td>
                  {available ? "Yes" : `${peso(m.priceCentavos)} a year`}
                </td>
                <td>
                  <Pill tone={on ? "ok" : "neutral"}>
                    {m.alwaysOn ? "Always on" : on ? "On" : "Off"}
                  </Pill>
                </td>
                <td>
                  {!m.alwaysOn && available && (
                    <form action={toggleModule}>
                      <input type="hidden" name="moduleKey" value={key} />
                      <input type="hidden" name="enable" value={on ? "0" : "1"} />
                      <button className="whitespace-nowrap h-9 rounded-control border border-line bg-surface px-3 text-sm font-medium shadow-control hover:bg-subtle">
                        {on ? "Switch off" : "Switch on"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        <p className="px-5 py-4 text-muted sm:px-6">
          Modules outside your tier come with an upgrade. Your plan and what it
          costs are on{" "}
          <Link href="/billing" className="font-medium text-primary underline underline-offset-2">
            Billing
          </Link>
          .
        </p>
      </Section>

      <Section
        title="What they tell each other"
        subtitle="No module reads another one's records. They pass these along instead, and a link only runs while both ends are on."
      >
        <ul className="-mx-1">
          {[...liveLinks, ...dormantLinks].map((l) => {
            const live = isOn(l.from) && isOn(l.to);
            return (
              <li
                key={`${l.from}-${l.to}-${l.event}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-line px-1 py-2.5 first:border-t-0"
              >
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 translate-y-[1px]"
                  style={{ background: live ? "var(--ok)" : "var(--line-strong)" }}
                />
                <span className={live ? "font-medium" : "text-muted"}>
                  {MODULES[l.from].name}
                </span>
                <span className="text-muted">
                  sends {LINK_WORDS[l.event] ?? l.event} to
                </span>
                <span className={live ? "font-medium" : "text-muted"}>
                  {MODULES[l.to].name}
                </span>
                {!live && (
                  <span className="text-muted">
                    (waiting on {isOn(l.from) ? MODULES[l.to].name : MODULES[l.from].name})
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {readsEverything.length > 0 && (
          <p className="mt-4 max-w-[70ch] text-sm text-muted">
            {readsEverything.map((k) => MODULES[k].name).join(" and ")} reads
            everything the other modules send, so its dashboards cover whichever
            of them are on.
          </p>
        )}
      </Section>
    </>
  );
}
