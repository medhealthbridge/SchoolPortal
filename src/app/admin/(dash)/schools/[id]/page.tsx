import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, withPlatform } from "@/db";
import { auditLog, invoices, schoolModules, schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { TIER_LIST, TIERS, peso } from "@/lib/pricing";
import { activeStudentCount } from "@/lib/invoicing";
import { Banner, Meta, Section, Table } from "@/components/ui";
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
      <Section
        title={school.name}
        subtitle={<Meta items={[school.subdomain, `${school.ownerName}, ${school.ownerEmail}`, `${students} active students`]} />}
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
          <form action={setSchoolStatus} className="ledger-page grid gap-3 p-4">
            <input type="hidden" name="schoolId" value={school.id} />
            <span className="text-sm font-medium">
              Status: {school.status.replace("_", " ")}
            </span>
            <input
              name="reason"
              placeholder="Reason (logged)"
              className="rounded-[2px] border border-[var(--rule)] border-b-2 border-b-[var(--ink-soft)] bg-[var(--paper-raised)] px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                name="status"
                value="suspended"
                className="rounded-[2px] bg-[#b3261e] px-3 py-1.5 text-sm font-medium text-white"
              >
                Suspend
              </button>
              <button
                name="status"
                value="active"
                className="rounded-[2px] bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white"
              >
                Reactivate
              </button>
            </div>
            <p className="text-xs text-[var(--ink-faint)]">
              Suspend by hand after a grace period. A school locked out during
              exam week over a late bank transfer is a lost customer.
            </p>
          </form>

          <form action={changeTier} className="ledger-page grid gap-3 p-4">
            <input type="hidden" name="schoolId" value={school.id} />
            <span className="text-sm font-medium">
              Tier: {TIERS[school.tier].name}, {peso(TIERS[school.tier].platformFeeCentavos)} a year
            </span>
            <select
              name="tier"
              defaultValue={school.tier}
              className="rounded-[2px] border border-[var(--rule)] border-b-2 border-b-[var(--ink-soft)] bg-[var(--paper-raised)] px-3 py-2 text-sm"
            >
              {TIER_LIST.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name} — {peso(t.platformFeeCentavos)}/yr
                </option>
              ))}
            </select>
            <button className="w-fit rounded-[2px] bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white">
              Change tier
            </button>
          </form>
        </div>
      </Section>

      <Section title="Modules">
        <ul className="flex flex-wrap gap-2 text-xs">
          {MODULE_KEYS.map((key) => {
            const on = MODULES[key].alwaysOn || moduleState.get(key) === true;
            return (
              <li
                key={key}
                className={`inline-block border-l-2 py-0.5 pl-2 ${
                  on
                    ? "border-[var(--color-present)] text-[var(--color-present)]"
                    : "border-[var(--rule)] text-[var(--ink-faint)]"
                }`}
              >
                {MODULES[key].name}, {on ? "on" : "off"}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Invoices">
        {data.invoices.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Nothing issued yet.</p>
        ) : (
          <Table head={["Period", "Students", "Total", "Due", "Status"]}>
            {data.invoices.map((i) => (
              <tr key={i.id}>
                <td className="py-2 pr-5">{i.period}</td>
                <td className="py-2 pr-5 tabular-nums">{i.studentCount}</td>
                <td className="py-2 pr-5 tabular-nums">{peso(i.totalCentavos)}</td>
                <td className="py-2 pr-5">{prettyDate(i.dueOn)}</td>
                <td className="py-2 pr-5">{i.status}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Recent activity">
        <Table head={["When", "Who", "Action"]}>
          {data.audit.map((a) => (
            <tr key={a.id}>
              <td className="py-2 pr-5 whitespace-nowrap text-xs tabular-nums">
                {a.at.toLocaleString("en-PH")}
              </td>
              <td className="py-2 pr-5">{a.actorLabel}</td>
              <td className="py-2 pr-5">{readableAction(a.action)}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}

/** `attendance.superseded` reads as "Attendance superseded" in a log people scan. */
function readableAction(action: string) {
  const words = action.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
