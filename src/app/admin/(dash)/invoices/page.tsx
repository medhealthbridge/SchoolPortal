import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { peso } from "@/lib/pricing";
import { Section, Table } from "@/components/ui";
import { monthKey, prettyDate } from "@/lib/format";
import { markInvoicePaid, runBilling } from "../actions";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  await requireAdmin();
  const rows = await db
    .select({ invoice: invoices, school: schools })
    .from(invoices)
    .innerJoin(schools, eq(schools.id, invoices.schoolId))
    .orderBy(desc(invoices.issuedAt))
    .limit(100);

  const outstanding = rows
    .filter((r) => r.invoice.status === "issued")
    .reduce((n, r) => n + r.invoice.totalCentavos, 0);

  return (
    <div className="grid gap-5">
      <Section
        title="Invoices"
        subtitle={`${peso(outstanding)} outstanding`}
        actions={
          <form action={runBilling}>
            <button className="rounded-[2px] bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white">
              Run billing for {monthKey()}
            </button>
          </form>
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            Nothing issued yet. Running billing counts each school&apos;s active
            students and issues one invoice per school for the month.
          </p>
        ) : (
          <Table head={["School", "Period", "Students", "Total", "Due", "Status", "Record payment"]}>
            {rows.map(({ invoice, school }) => (
              <tr key={invoice.id}>
                <td className="py-2 pr-5 font-medium">{school.name}</td>
                <td className="py-2 pr-5">{invoice.period}</td>
                <td className="py-2 pr-5 tabular-nums">{invoice.studentCount}</td>
                <td className="py-2 pr-5 tabular-nums">{peso(invoice.totalCentavos)}</td>
                <td className="py-2 pr-5 text-xs">{prettyDate(invoice.dueOn)}</td>
                <td className="py-2 pr-5">{invoice.status}</td>
                <td className="py-2 pr-5">
                  {invoice.status === "issued" && (
                    <form action={markInvoicePaid} className="flex gap-1">
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <input
                        type="hidden"
                        name="amountCentavos"
                        value={invoice.totalCentavos}
                      />
                      <input
                        name="reference"
                        placeholder="Reference"
                        className="w-28 rounded-[2px] border border-[var(--rule)] border-b-2 border-b-[var(--ink-soft)] bg-[var(--paper-raised)] px-2 py-1 text-xs"
                      />
                      <button className="rounded-[2px] border border-[var(--ink-soft)] px-2.5 py-1 text-[0.8125rem] hover:bg-[var(--paper-sunken)]">
                        Mark paid
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
