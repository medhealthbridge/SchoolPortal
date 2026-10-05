import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { peso } from "@/lib/pricing";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Pill,
  Section,
  StatGrid,
  StatTile,
  Table,
} from "@/components/ui";
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

  const open = rows.filter((r) => r.invoice.status === "issued");
  const outstanding = open.reduce((n, r) => n + r.invoice.totalCentavos, 0);
  const collected = rows
    .filter((r) => r.invoice.status === "paid")
    .reduce((n, r) => n + r.invoice.totalCentavos, 0);

  return (
    <>
      <PageHeader
        title="Invoices"
        meta={`${rows.length} issued`}
        actions={
          <form action={runBilling}>
            <Button type="submit">Run billing for {monthKey()}</Button>
          </form>
        }
      />

      {rows.length > 0 && (
        <StatGrid>
          <StatTile
            label="Outstanding"
            value={peso(outstanding)}
            caption={`${open.length} unpaid invoices`}
          />
          <StatTile label="Collected" value={peso(collected)} caption="Across every school" />
        </StatGrid>
      )}

      <Section
        title="Every invoice"
        subtitle="Payments land by bank transfer or e-wallet and are recorded here by hand."
        flush={rows.length > 0}
      >
        {rows.length === 0 ? (
          <EmptyState title="Nothing issued yet">
            Running billing counts each school&apos;s active students and issues one invoice per
            school for the month.
          </EmptyState>
        ) : (
          <Table
            head={["School", "Period", "Students", "Total", "Due", "Status", "Record payment"]}
            minWidth={860}
          >
            {rows.map(({ invoice, school }) => (
              <tr key={invoice.id}>
                <th scope="row" className="text-left font-medium">
                  {school.name}
                </th>
                <td>{invoice.period}</td>
                <td>{invoice.studentCount}</td>
                <td className="font-medium">{peso(invoice.totalCentavos)}</td>
                <td className="whitespace-nowrap text-muted">{prettyDate(invoice.dueOn)}</td>
                <td>
                  <Pill tone={invoice.status === "paid" ? "ok" : "warn"}>{invoice.status}</Pill>
                </td>
                <td>
                  {invoice.status === "issued" && (
                    <form action={markInvoicePaid} className="flex items-center gap-2">
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <input type="hidden" name="amountCentavos" value={invoice.totalCentavos} />
                      <Input
                        name="reference"
                        placeholder="Reference"
                        aria-label={`Payment reference for ${school.name}`}
                        className="w-32"
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        Mark paid
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
