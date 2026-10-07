import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolYears } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { feeItemsFor, recentPayments, studentsOwing } from "@/modules/billing/queries";
import { peso } from "@/lib/pricing";
import { prettyDate } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import {
  EmptyState,
  Field,
  Input,
  Meta,
  PageHeader,
  Pill,
  Section,
  Select,
  StatGrid,
  StatTile,
  Table,
} from "@/components/ui";
import { addFeeItem, chargeFeeAction, recordStudentPayment } from "./actions";
import { ExportPanel } from "@/components/export-panel";

export const metadata = { title: "School fees" };

export default async function FeesPage() {
  const { school, session } = await requirePermission("fees.manage");

  const data = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    return {
      year,
      fees: year ? await feeItemsFor(tx, school.id, year.id) : [],
      owing: await studentsOwing(tx, school.id),
      payments: await recentPayments(tx, school.id),
    };
  });

  const outstanding = data.owing.reduce((n, r) => n + r.balanceCentavos, 0);
  const collected = data.payments.reduce((n, p) => n + p.payment.amountCentavos, 0);

  return (
    <>
      <PageHeader
        title="School fees"
        meta={<Meta items={[data.year?.name ?? "No school year", `${data.owing.length} students owing`]} />}
      />

      <StatGrid>
        <StatTile
          label="Outstanding"
          value={peso(outstanding)}
          caption={`${data.owing.length} students with a balance`}
          pill={data.owing.length > 0 ? <Pill tone="warn">Holds clearance</Pill> : null}
        />
        <StatTile
          label="Recently collected"
          value={peso(collected)}
          caption="Across the last 20 receipts"
        />
        <StatTile label="Fees defined" value={data.fees.length} caption="This school year" />
      </StatGrid>

      <Section title="Record a payment" subtitle="Clearing a balance lifts the registrar's hold at once.">
        <ActionForm action={recordStudentPayment} submitLabel="Record the payment">
          <Field label="Student ID" htmlFor="pay-student">
            <Input id="pay-student" name="studentNumber" required placeholder="ST-2026-0001" />
          </Field>
          <Field label="Amount in pesos" htmlFor="pay-amount">
            <Input id="pay-amount" name="amount" type="number" min={1} step="0.01" required />
          </Field>
          <Field label="Receipt number" htmlFor="pay-receipt">
            <Input id="pay-receipt" name="receiptNo" required placeholder="OR-00142" />
          </Field>
          <Field label="How" htmlFor="pay-method">
            <Select id="pay-method" name="method" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="e_wallet">E-wallet</option>
              <option value="cheque">Cheque</option>
            </Select>
          </Field>
        </ActionForm>
      </Section>

      <Section
        title="Who owes"
        subtitle="Biggest balance first. An unpaid balance places a hold in Registrar, if it is on."
        flush={data.owing.length > 0}
      >
        {data.owing.length === 0 ? (
          <EmptyState title="Nobody owes anything">
            Charge a fee below and balances appear here.
          </EmptyState>
        ) : (
          <Table head={["Student", "ID", "Section", "Balance"]} minWidth={560}>
            {data.owing.slice(0, 50).map((r) => (
              <tr key={r.studentId}>
                <th scope="row" className="text-left font-medium">
                  <Link href={`/child/${r.studentId}`} className="underline underline-offset-2">
                    {r.name}
                  </Link>
                </th>
                <td className="text-muted">{r.studentNumber}</td>
                <td>{r.section ?? "—"}</td>
                <td className="font-semibold" style={{ color: "var(--late-fg)" }}>
                  {peso(r.balanceCentavos)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Fees for this year" flush={data.fees.length > 0}>
        {data.fees.length === 0 ? (
          <EmptyState title="No fees defined yet">
            Add tuition, miscellaneous and anything else your school charges.
          </EmptyState>
        ) : (
          <Table head={["Fee", "Applies to", "Amount", "Due", ""]} minWidth={620}>
            {data.fees.map((f) => (
              <tr key={f.id}>
                <th scope="row" className="text-left font-medium">
                  {f.name}
                </th>
                <td>{f.level ?? "Every level"}</td>
                <td className="font-semibold">{peso(f.amountCentavos)}</td>
                <td className="whitespace-nowrap text-muted">
                  {f.dueOn ? prettyDate(f.dueOn) : "—"}
                </td>
                <td>
                  <form action={chargeFeeAction}>
                    <input type="hidden" name="feeItemId" value={f.id} />
                    <button className="h-9 rounded-control border border-line bg-surface px-3 text-sm font-medium shadow-control hover:bg-subtle">
                      Charge everyone
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Add a fee">
        <ActionForm action={addFeeItem} submitLabel="Save fee">
          <Field label="Name" htmlFor="fi-name">
            <Input id="fi-name" name="name" required placeholder="Tuition, first semester" />
          </Field>
          <Field label="Amount in pesos" htmlFor="fi-amount">
            <Input id="fi-amount" name="amount" type="number" min={1} step="0.01" required />
          </Field>
          <Field label="Level" htmlFor="fi-level" hint="Leave empty to charge every level.">
            <Input id="fi-level" name="level" placeholder="Grade 7" />
          </Field>
          <Field label="Due" htmlFor="fi-due">
            <Input id="fi-due" name="dueOn" type="date" />
          </Field>
        </ActionForm>
      </Section>

      {data.payments.length > 0 && (
        <Section title="Recent receipts" flush>
          <Table head={["Date", "Student", "Receipt", "How", "Amount"]} minWidth={620}>
            {data.payments.map((p) => (
              <tr key={p.payment.id}>
                <td className="whitespace-nowrap text-muted">{prettyDate(p.payment.paidOn)}</td>
                <th scope="row" className="text-left font-medium">
                  {p.lastName}, {p.firstName}
                </th>
                <td>{p.payment.receiptNo}</td>
                <td className="text-muted">{p.payment.method.replace("_", " ")}</td>
                <td className="font-semibold">{peso(p.payment.amountCentavos)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
      <ExportPanel dataset="charges" roles={session.roles} />
      <ExportPanel dataset="payments" roles={session.roles} />
    </>
  );
}
