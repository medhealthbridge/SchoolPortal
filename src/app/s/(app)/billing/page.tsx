import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { invoices, subscriptions } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { MODULES } from "@/lib/modules";
import { TIERS, peso } from "@/lib/pricing";
import {
  Callout,
  EmptyState,
  PageHeader,
  Pill,
  Section,
  StatGrid,
  StatTile,
  Table,
} from "@/components/ui";
import { prettyDate } from "@/lib/format";
import { configured as paymentsConfigured } from "@/lib/payments";
import { PayButton } from "./pay";

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
  // No provider configured means no button, and the bank-transfer wording
  // stays exactly as it was.
  const online = paymentsConfigured();

  return (
    <>
      <PageHeader
        title="Billing"
        meta={`${tier.name} tier${unpaid.length ? `, ${unpaid.length} unpaid` : ", nothing outstanding"}`}
      />
      {school.status === "suspended" && (
        <Callout tone="danger" title="This account is on hold">
          Nothing has been deleted. Settle the invoice below and everything returns at once.
        </Callout>
      )}

      <Section title="Your plan" subtitle={`${tier.name}, ${peso(tier.platformFeeCentavos)} a year`}>
        <ul className="flex flex-wrap gap-2">
          {tier.modules.map((m) => (
            <li key={m}>
              <Pill>{MODULES[m].name}</Pill>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[70ch] text-sm text-muted">
          Switch any of them on or off from{" "}
          <Link href="/modules" className="font-medium text-primary underline underline-offset-2">
            Modules
          </Link>
          . Plus {peso(data.sub?.perStudentCentavos ?? 2000)} per active student per
          month, counted on the 1st. An upgrade mid-year is charged pro rata for
          the months left; a downgrade takes effect at the next renewal and the
          hidden modules keep their data.
        </p>
      </Section>

      <Section
        flush={data.invoices.length > 0}
        title="Invoices"
        subtitle={unpaid.length ? `${unpaid.length} unpaid` : "Nothing outstanding"}
      >
        {data.invoices.length === 0 ? (
          <p className="text-sm text-muted">
            No invoices yet — your trial has not been billed.
          </p>
        ) : (
          <Table
            head={[
              "Period",
              "Students",
              "Platform fee",
              "Student fee",
              "Total",
              "Due",
              "Status",
              ...(online ? [""] : []),
            ]}
            minWidth={online ? 900 : 760}
          >
            {data.invoices.map((i) => (
              <tr key={i.id}>
                <td className="font-medium">{i.period}</td>
                <td className="tabular-nums">{i.studentCount}</td>
                <td className="tabular-nums">{peso(i.platformFeeCentavos)}</td>
                <td className="tabular-nums">{peso(i.studentFeeCentavos)}</td>
                <td className="font-medium tabular-nums">{peso(i.totalCentavos)}</td>
                <td>{prettyDate(i.dueOn)}</td>
                <td><Pill tone={i.status === "paid" ? "ok" : "warn"}>{i.status}</Pill></td>
                {online && (
                  <td>
                    {i.status === "issued" && (
                      <PayButton invoiceId={i.id} amount={peso(i.totalCentavos)} />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </Table>
        )}
        <p className="px-5 py-4 text-muted sm:px-6">
          {online
            ? "Paying online clears the invoice as soon as the money lands. A bank transfer works too — send the reference and the platform records it."
            : "Pay by bank transfer or e-wallet and send the reference; the platform records it by hand."}
        </p>
      </Section>
    </>
  );
}
