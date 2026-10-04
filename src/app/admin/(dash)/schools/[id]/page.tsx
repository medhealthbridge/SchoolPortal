import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, withPlatform } from "@/db";
import { auditLog, invoices, schoolModules, schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { TIER_LIST, TIERS, peso } from "@/lib/pricing";
import { activeStudentCount } from "@/lib/invoicing";
import { Banner, Card, Table } from "@/components/ui";
import { prettyDate } from "@/lib/format";
import { changeTier, setSchoolStatus } from "../../actions";

export default async function SchoolDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [school] = await db.select().from(schools).where(eq(schools.id, id)).limit(1);
  if (!school) notFound();

  const data = await withPlatform(async (tx) => ({
    modules: await tx.select().from(schoolModules).where(eq(schoolModules.schoolId, id)),
    invoices: await tx
      .select()
      .from(invoices)
      .where(eq(invoices.schoolId, id))
      .orderBy(desc(invoices.period))
      .limit(12),
    audit: await tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.schoolId, id))
      .orderBy(desc(auditLog.at))
      .limit(15),
  }));
  const students = await activeStudentCount(id);
  const moduleState = new Map(data.modules.map((m) => [m.moduleKey, m.enabled]));

  return (
    <div className="grid gap-5">
      <Card
        title={school.name}
        subtitle={`${school.subdomain} · ${school.ownerName} <${school.ownerEmail}> · ${students} active students`}
      >
        {school.status === "suspended" && (
          <div className="mb-4">
            <Banner tone="danger">
              On hold since {school.suspendedAt?.toLocaleString("en-PH")}
              {school.suspendedReason ? ` — ${school.suspendedReason}` : ""}. Data is
              kept, frozen as it was.
            </Banner>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <form action={setSchoolStatus} className="grid gap-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
            <input type="hidden" name="schoolId" value={school.id} />
            <span className="text-sm font-medium">
              Status: {school.status.replace("_", " ")}
            </span>
            <input
              name="reason"
              placeholder="Reason (logged)"
              className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5"
            />
            <div className="flex gap-2">
              <button
                name="status"
                value="suspended"
                className="rounded-lg bg-[#b3261e] px-3 py-1.5 text-sm text-white"
              >
                Suspend
              </button>
              <button
                name="status"
                value="active"
                className="brand-bg rounded-lg px-3 py-1.5 text-sm text-white"
              >
                Reactivate
              </button>
            </div>
            <p className="text-xs text-black/55 dark:text-white/55">
              Suspend by hand after a grace period. A school locked out during
              exam week over a late bank transfer is a lost customer.
            </p>
          </form>

          <form action={changeTier} className="grid gap-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
            <input type="hidden" name="schoolId" value={school.id} />
            <span className="text-sm font-medium">
              Tier: {TIERS[school.tier].name} · {peso(TIERS[school.tier].platformFeeCentavos)}/yr
            </span>
            <select
              name="tier"
              defaultValue={school.tier}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5"
            >
              {TIER_LIST.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name} — {peso(t.platformFeeCentavos)}/yr
                </option>
              ))}
            </select>
            <button className="brand-bg w-fit rounded-lg px-3 py-1.5 text-sm text-white">
              Change tier
            </button>
          </form>
        </div>
      </Card>

      <Card title="Modules">
        <ul className="flex flex-wrap gap-2 text-xs">
          {MODULE_KEYS.map((key) => {
            const on = MODULES[key].alwaysOn || moduleState.get(key) === true;
            return (
              <li
                key={key}
                className={`rounded-full px-3 py-1 ${
                  on ? "bg-[#e6f4ec] text-[#14532d]" : "bg-black/5 text-black/50"
                }`}
              >
                {MODULES[key].name} · {on ? "on" : "off"}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Invoices">
        {data.invoices.length === 0 ? (
          <p className="text-sm text-black/60">Nothing issued yet.</p>
        ) : (
          <Table head={["Period", "Students", "Total", "Due", "Status"]}>
            {data.invoices.map((i) => (
              <tr key={i.id}>
                <td className="py-2 pr-4">{i.period}</td>
                <td className="py-2 pr-4 tabular-nums">{i.studentCount}</td>
                <td className="py-2 pr-4 tabular-nums">{peso(i.totalCentavos)}</td>
                <td className="py-2 pr-4">{prettyDate(i.dueOn)}</td>
                <td className="py-2 pr-4">{i.status}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Recent activity">
        <Table head={["When", "Who", "Action"]}>
          {data.audit.map((a) => (
            <tr key={a.id}>
              <td className="py-2 pr-4 whitespace-nowrap text-xs tabular-nums">
                {a.at.toLocaleString("en-PH")}
              </td>
              <td className="py-2 pr-4">{a.actorLabel}</td>
              <td className="py-2 pr-4 font-mono text-xs">{a.action}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
