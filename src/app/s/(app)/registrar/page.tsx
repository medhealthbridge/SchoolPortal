import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { registrarRequests, students } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { enabledModules } from "@/lib/tenant";
import { MODULES } from "@/lib/modules";
import { ActionForm } from "@/components/action-form";
import {
  Button,
  Callout,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pill,
  Section,
  Select,
  StatGrid,
  StatTile,
  Table,
} from "@/components/ui";
import { openRequest, recheckRequest, releaseRequest } from "./actions";

export const metadata = { title: "Registrar" };

const STATUS_TONE = {
  requested: "neutral",
  on_hold: "warn",
  cleared: "ok",
  released: "ok",
  declined: "danger",
} as const;

const KIND_LABEL = {
  enrollment: "Enrolment",
  transfer_out: "Transfer out",
  certificate: "Certificate",
  transcript: "Transcript",
} as const;

export default async function RegistrarPage() {
  const { school } = await requirePermission("registrar.manage");
  const on = await enabledModules(school.id);

  const rows = await withTenant(school.id, (tx) =>
    tx
      .select({
        row: registrarRequests,
        firstName: students.firstName,
        lastName: students.lastName,
        studentNumber: students.studentNumber,
      })
      .from(registrarRequests)
      .innerJoin(students, eq(students.id, registrarRequests.studentId))
      .where(eq(registrarRequests.schoolId, school.id))
      .orderBy(desc(registrarRequests.requestedAt))
      .limit(100),
  );

  const held = rows.filter((r) => r.row.status === "on_hold");
  const ready = rows.filter((r) => r.row.status === "cleared");
  const checks = (["billing", "discipline"] as const).filter((k) => on.has(k));

  return (
    <>
      <PageHeader title="Registrar" meta={`${rows.length} requests, ${held.length} on hold`} />

      {checks.length === 0 ? (
        <Callout tone="warn" title="Nothing to check clearance against">
          Clearance asks the offices that are switched on. With neither Billing nor Discipline
          on, every request clears automatically.
        </Callout>
      ) : (
        <Callout tone="info" title="Clearance checks">
          Each request asks {checks.map((k) => MODULES[k].name).join(" and ")} before it
          clears. Settle the hold and press Re-check.
        </Callout>
      )}

      <StatGrid>
        <StatTile label="On hold" value={held.length} caption="Waiting on another office" />
        <StatTile label="Cleared" value={ready.length} caption="Ready to release" />
        <StatTile
          label="Released"
          value={rows.filter((r) => r.row.status === "released").length}
          caption="Handed over"
        />
      </StatGrid>

      <Section title="Open a request" subtitle="Clearance is checked the moment it is filed.">
        <ActionForm action={openRequest} submitLabel="File the request">
          <Field label="Student ID" htmlFor="rr-student">
            <Input id="rr-student" name="studentNumber" required placeholder="ST-2026-0001" />
          </Field>
          <Field label="What for" htmlFor="rr-kind">
            <Select id="rr-kind" name="kind" defaultValue="certificate">
              <option value="certificate">Certificate</option>
              <option value="transcript">Transcript</option>
              <option value="enrollment">Enrolment</option>
              <option value="transfer_out">Transfer out</option>
            </Select>
          </Field>
          <Field label="Purpose" htmlFor="rr-purpose">
            <Input id="rr-purpose" name="purpose" placeholder="Scholarship application" />
          </Field>
        </ActionForm>
      </Section>

      <Section title="Requests" flush={rows.length > 0}>
        {rows.length === 0 ? (
          <EmptyState title="No requests yet">
            File one above and it is checked against the other offices straight away.
          </EmptyState>
        ) : (
          <Table head={["Student", "What for", "Status", "Why it is held", ""]} minWidth={820}>
            {rows.map((r) => (
              <tr key={r.row.id}>
                <th scope="row" className="text-left font-medium">
                  <Link href={`/child/${r.row.studentId}`} className="underline underline-offset-2">
                    {r.lastName}, {r.firstName}
                  </Link>
                  <span className="block text-[13px] font-normal text-muted">
                    {r.studentNumber}
                  </span>
                </th>
                <td>{KIND_LABEL[r.row.kind]}</td>
                <td>
                  <Pill tone={STATUS_TONE[r.row.status]}>{r.row.status.replace("_", " ")}</Pill>
                </td>
                <td className="max-w-[34ch] text-muted">{r.row.holdReason ?? "—"}</td>
                <td>
                  <div className="flex gap-2">
                    {r.row.status === "on_hold" && (
                      <form action={recheckRequest}>
                        <input type="hidden" name="requestId" value={r.row.id} />
                        <Button type="submit" variant="secondary" size="sm">
                          Re-check
                        </Button>
                      </form>
                    )}
                    {r.row.status === "cleared" && (
                      <form action={releaseRequest}>
                        <input type="hidden" name="requestId" value={r.row.id} />
                        <Button type="submit" size="sm">
                          Release
                        </Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
