import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, withPlatform } from "@/db";
import { auditLog, invoices, schoolModules, schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { TIER_LIST, TIERS, peso } from "@/lib/pricing";
import { activeStudentCount } from "@/lib/invoicing";
import {
  Button,
  Callout,
  EmptyState,
  Field,
  Input,
  Meta,
  PageHeader,
  Pill,
  Section,
  Select,
  Table,
} from "@/components/ui";
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
    <>
      <PageHeader
        title={school.name}
        meta={
          <Meta
            items={[
              school.subdomain,
              `${school.ownerName}, ${school.ownerEmail}`,
              `${students} active students`,
            ]}
          />
        }
      />

      {school.status === "suspended" && (
        <Callout tone="danger" title="On hold">
          Since {school.suspendedAt?.toLocaleString("en-PH")}
          {school.suspendedReason ? `, ${school.suspendedReason}` : ""}. Data is kept, frozen as
          it was.
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title={`Status: ${school.status.replace("_", " ")}`}
          subtitle="Suspension changes one field. Nothing is deleted, and reactivating puts everything back at once."
        >
          <form action={setSchoolStatus} className="flex flex-col gap-4">
            <input type="hidden" name="schoolId" value={school.id} />
            <Field label="Reason" hint="Logged with who pressed it and when.">
              <Input name="reason" placeholder="Invoice unpaid for 45 days" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button name="status" value="suspended" variant="danger">
                Suspend this school
              </Button>
              <Button name="status" value="active" variant="secondary">
                Reactivate
              </Button>
            </div>
            <p className="text-[13px] text-muted">
              Suspend by hand after a grace period. A school locked out during exam week over a
              late bank transfer is a lost customer.
            </p>
          </form>
        </Section>

        <Section
          title={`Tier: ${TIERS[school.tier].name}`}
          subtitle={`${peso(TIERS[school.tier].platformFeeCentavos)} a year. Changing it switches the tier's modules on or off; their records stay either way.`}
        >
          <form action={changeTier} className="flex flex-col gap-4">
            <input type="hidden" name="schoolId" value={school.id} />
            <Field label="Tier">
              <Select name="tier" defaultValue={school.tier}>
                {TIER_LIST.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name} — {peso(t.platformFeeCentavos)} a year
                  </option>
                ))}
              </Select>
            </Field>
            <Button className="w-fit">Change tier</Button>
          </form>
        </Section>
      </div>

      <Section title="Modules">
        <ul className="flex flex-wrap gap-2">
          {MODULE_KEYS.map((key) => {
            const on = MODULES[key].alwaysOn || moduleState.get(key) === true;
            return (
              <li key={key}>
                <Pill tone={on ? "ok" : "neutral"}>
                  {MODULES[key].name}, {on ? "on" : "off"}
                </Pill>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Invoices" flush={data.invoices.length > 0}>
        {data.invoices.length === 0 ? (
          <EmptyState title="Nothing issued yet">
            Run billing from the Invoices page to issue this month.
          </EmptyState>
        ) : (
          <Table head={["Period", "Students", "Total", "Due", "Status"]} minWidth={520}>
            {data.invoices.map((i) => (
              <tr key={i.id}>
                <th scope="row" className="text-left font-medium">
                  {i.period}
                </th>
                <td>{i.studentCount}</td>
                <td>{peso(i.totalCentavos)}</td>
                <td className="whitespace-nowrap text-muted">{prettyDate(i.dueOn)}</td>
                <td>
                  <Pill tone={i.status === "paid" ? "ok" : "warn"}>{i.status}</Pill>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Recent activity" flush>
        <Table head={["When", "Who", "What"]} minWidth={520}>
          {data.audit.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap text-muted">{a.at.toLocaleString("en-PH")}</td>
              <td>{a.actorLabel}</td>
              <td>{readableAction(a.action)}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}

/** `attendance.superseded` reads as "Attendance superseded" in a log people scan. */
function readableAction(action: string) {
  const words = action.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
