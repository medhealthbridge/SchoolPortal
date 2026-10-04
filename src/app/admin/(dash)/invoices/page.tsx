import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { peso } from "@/lib/pricing";
import { Card, Table } from "@/components/ui";
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
      <Card
        title="Invoices"
        subtitle={`${peso(outstanding)} outstanding`}
        actions={
          <form action={runBilling}>
            <button className="brand-bg rounded-lg px-3 py-1.5 text-sm text-white">
              Run billing for {monthKey()}
            </button>
          </form>
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-black/60">
            Nothing issued yet. Running billing counts each school&apos;s active
            students and issues one invoice per school for the month.
          </p>
        ) : (
          <Table head={["School", "Period", "Students", "Total", "Due", "Status", "Record payment"]}>
            {rows.map(({ invoice, school }) => (
              <tr key={invoice.id}>
                <td className="py-2 pr-4 font-medium">{school.name}</td>
                <td className="py-2 pr-4">{invoice.period}</td>
                <td className="py-2 pr-4 tabular-nums">{invoice.studentCount}</td>
                <td className="py-2 pr-4 tabular-nums">{peso(invoice.totalCentavos)}</td>
                <td className="py-2 pr-4 text-xs">{prettyDate(invoice.dueOn)}</td>
                <td className="py-2 pr-4">{invoice.status}</td>
                <td className="py-2 pr-4">
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
                        className="w-28 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 dark:bg-white/5"
                      />
                      <button className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20">
                        Mark paid
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
