import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { invoices, subscriptions } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { MODULES } from "@/lib/modules";
import { TIERS, peso } from "@/lib/pricing";
import { Banner, Section, Table } from "@/components/ui";
import { prettyDate } from "@/lib/format";

export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const { school } = await requirePermission("school.billing.view");

  const data = await withTenant(school.id, async (tx) => ({
    sub: (
      await tx.select().from(subscriptions).where(eq(subscriptions.schoolId, school.id)).limit(1)
    )[0],
    invoices: await tx
      .select()
      .from(invoices)
      .where(eq(invoices.schoolId, school.id))
      .orderBy(desc(invoices.period))
      .limit(24),
  }));

  const tier = TIERS[school.tier];
  const unpaid = data.invoices.filter((i) => i.status === "issued");

  return (
    <div className="grid gap-5">
      {school.status === "suspended" && (
        <Banner tone="danger">
          This account is on hold. Nothing has been deleted; settle the invoice
          below and everything returns at once.
        </Banner>
      )}

      <Section title="Your plan" subtitle={`${tier.name}, ${peso(tier.platformFeeCentavos)} a year`}>
        <ul className="flex flex-wrap gap-2 text-xs">
          {tier.modules.map((m) => (
            <li key={m} className="rounded-[2px] border border-[var(--rule)] bg-[var(--paper-raised)] px-2 py-0.5 text-[var(--ink)]">
              {MODULES[m].name}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[70ch] text-sm text-[var(--ink-soft)]">
          Switch any of them on or off from{" "}
          <Link href="/modules" className="font-medium text-[var(--brand)] underline underline-offset-2">
            Modules
          </Link>
          . Plus {peso(data.sub?.perStudentCentavos ?? 2000)} per active student per
          month, counted on the 1st. An upgrade mid-year is charged pro rata for
          the months left; a downgrade takes effect at the next renewal and the
          hidden modules keep their data.
        </p>
      </Section>

      <Section
        title="Invoices"
        subtitle={unpaid.length ? `${unpaid.length} unpaid` : "Nothing outstanding"}
      >
        {data.invoices.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            No invoices yet — your trial has not been billed.
          </p>
        ) : (
          <Table head={["Period", "Students", "Platform fee", "Student fee", "Total", "Due", "Status"]}>
            {data.invoices.map((i) => (
              <tr key={i.id}>
                <td className="py-2 pr-5 font-medium">{i.period}</td>
                <td className="py-2 pr-5 tabular-nums">{i.studentCount}</td>
                <td className="py-2 pr-5 tabular-nums">{peso(i.platformFeeCentavos)}</td>
                <td className="py-2 pr-5 tabular-nums">{peso(i.studentFeeCentavos)}</td>
                <td className="py-2 pr-5 font-medium tabular-nums">{peso(i.totalCentavos)}</td>
                <td className="py-2 pr-5">{prettyDate(i.dueOn)}</td>
                <td className="py-2 pr-5">{i.status}</td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-4 text-xs text-[var(--ink-faint)]">
          Pay by bank transfer or e-wallet and send the reference; the platform
          records it by hand for now.
        </p>
      </Section>
    </div>
  );
}
