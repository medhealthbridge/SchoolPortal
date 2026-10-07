import { asc, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { incidents, offenseLevels, sanctions, students, users } from "@/db/schema";
import { requireModule, requireUser } from "@/lib/guard";
import { permissionsFor } from "@/lib/roles";
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
  Textarea,
} from "@/components/ui";
import { prettyDate, todayIso } from "@/lib/format";
import { addOffenseLevel, issueSanction, reportIncident } from "./actions";
import { ExportPanel } from "@/components/export-panel";

export const metadata = { title: "Discipline" };

const SEVERITY_TONE = { minor: "neutral", major: "warn", grave: "danger" } as const;

export default async function DisciplinePage() {
  const school = await requireModule("discipline");
  const { session } = await requireUser();
  const perms = permissionsFor(session.roles);
  if (!perms.has("discipline.report") && !perms.has("discipline.manage")) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  const manages = perms.has("discipline.manage");

  const data = await withTenant(school.id, async (tx) => {
    const all = await tx
      .select({
        incident: incidents,
        firstName: students.firstName,
        lastName: students.lastName,
        studentNumber: students.studentNumber,
        offense: offenseLevels.name,
        severity: offenseLevels.severity,
        reporter: users.name,
      })
      .from(incidents)
      .innerJoin(students, eq(students.id, incidents.studentId))
      .leftJoin(offenseLevels, eq(offenseLevels.id, incidents.offenseLevelId))
      .leftJoin(users, eq(users.id, incidents.reportedByUserId))
      .where(eq(incidents.schoolId, school.id))
      .orderBy(desc(incidents.onDate))
      .limit(100);

    return {
      // A teacher sees only the reports they filed; the office sees all.
      incidents: manages
        ? all
        : all.filter((r) => r.incident.reportedByUserId === session.userId),
      levels: await tx
        .select()
        .from(offenseLevels)
        .where(eq(offenseLevels.schoolId, school.id))
        .orderBy(asc(offenseLevels.name)),
      sanctions: await tx
        .select()
        .from(sanctions)
        .where(eq(sanctions.schoolId, school.id))
        .orderBy(desc(sanctions.startsOn))
        .limit(50),
    };
  });

  const open = data.incidents.filter((r) => r.incident.status !== "resolved");

  return (
    <>
      <PageHeader
        title="Discipline"
        meta={
          manages
            ? `${data.incidents.length} incidents, ${open.length} still open`
            : "The reports you have filed"
        }
      />

      {manages && (
        <StatGrid>
          <StatTile label="Open" value={open.length} caption="Reported, not yet resolved" />
          <StatTile
            label="Sanctions issued"
            value={data.sanctions.length}
            caption="Most recent 50"
          />
          <StatTile
            label="Suspensions"
            value={data.sanctions.filter((s) => s.kind === "suspension").length}
            caption="Those days are excused in Attendance"
          />
        </StatGrid>
      )}

      <Section title="Report an incident" subtitle="Anyone teaching can file one; the office handles it.">
        <ActionForm action={reportIncident} submitLabel="File the report">
          <Field label="Student ID" htmlFor="in-student">
            <Input id="in-student" name="studentNumber" required placeholder="ST-2026-0001" />
          </Field>
          <Field label="When" htmlFor="in-date">
            <Input id="in-date" name="onDate" type="date" defaultValue={todayIso()} required />
          </Field>
          <Field label="Offence" htmlFor="in-offense">
            <Select id="in-offense" name="offenseLevelId" defaultValue="">
              <option value="">Not categorised</option>
              {data.levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.severity})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What happened" htmlFor="in-summary">
            <Textarea id="in-summary" name="summary" rows={3} required />
          </Field>
        </ActionForm>
      </Section>

      <Section
        title={manages ? "Incidents" : "Your reports"}
        flush={data.incidents.length > 0}
      >
        {data.incidents.length === 0 ? (
          <EmptyState title="Nothing filed yet">
            A late mark from Attendance also reaches this office, if Attendance is on.
          </EmptyState>
        ) : (
          <Table head={["Date", "Student", "Offence", "What happened", "Status"]} minWidth={760}>
            {data.incidents.map((r) => (
              <tr key={r.incident.id}>
                <td className="whitespace-nowrap text-muted">{prettyDate(r.incident.onDate)}</td>
                <th scope="row" className="text-left font-medium">
                  {r.lastName}, {r.firstName}
                  <span className="block text-[13px] font-normal text-muted">
                    {r.studentNumber}
                  </span>
                </th>
                <td>
                  {r.offense ? (
                    <Pill tone={SEVERITY_TONE[r.severity ?? "minor"]}>{r.offense}</Pill>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="max-w-[32ch] truncate">{r.incident.summary}</td>
                <td>
                  <Pill tone={r.incident.status === "resolved" ? "ok" : "warn"}>
                    {r.incident.status.replace("_", " ")}
                  </Pill>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {manages && (
        <>
          <Section
            title="Issue a sanction"
            subtitle="A suspension tells Attendance to mark those school days excused, not absent."
          >
            <ActionForm action={issueSanction} submitLabel="Record the sanction">
              <Field label="Incident" htmlFor="sa-incident">
                <Select id="sa-incident" name="incidentId" required defaultValue="">
                  <option value="">Choose…</option>
                  {data.incidents.map((r) => (
                    <option key={r.incident.id} value={r.incident.id}>
                      {prettyDate(r.incident.onDate)} — {r.lastName}, {r.firstName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sanction" htmlFor="sa-kind">
                <Select id="sa-kind" name="kind" defaultValue="warning">
                  <option value="warning">Warning</option>
                  <option value="community_service">Community service</option>
                  <option value="detention">Detention</option>
                  <option value="suspension">Suspension</option>
                  <option value="referral">Referral to guidance</option>
                </Select>
              </Field>
              <Field label="Starts" htmlFor="sa-start">
                <Input id="sa-start" name="startsOn" type="date" defaultValue={todayIso()} required />
              </Field>
              <Field label="Ends" htmlFor="sa-end" hint="Leave empty for a single day.">
                <Input id="sa-end" name="endsOn" type="date" />
              </Field>
              <Field label="Note" htmlFor="sa-note">
                <Input id="sa-note" name="note" />
              </Field>
            </ActionForm>
          </Section>

          <Section title="Offence levels" flush={data.levels.length > 0}>
            {data.levels.length === 0 ? (
              <EmptyState title="No offences defined yet">
                Name the ones your handbook lists, so reports are consistent.
              </EmptyState>
            ) : (
              <Table head={["Offence", "Severity", "Description"]} minWidth={520}>
                {data.levels.map((l) => (
                  <tr key={l.id}>
                    <th scope="row" className="text-left font-medium">
                      {l.name}
                    </th>
                    <td>
                      <Pill tone={SEVERITY_TONE[l.severity]}>{l.severity}</Pill>
                    </td>
                    <td className="text-muted">{l.description ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          <Section title="Add an offence level">
            <ActionForm action={addOffenseLevel} submitLabel="Save offence">
              <Field label="Name" htmlFor="ol-name">
                <Input id="ol-name" name="name" required placeholder="Cutting class" />
              </Field>
              <Field label="Severity" htmlFor="ol-sev">
                <Select id="ol-sev" name="severity" defaultValue="minor">
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                  <option value="grave">Grave</option>
                </Select>
              </Field>
              <Field label="Description" htmlFor="ol-desc">
                <Input id="ol-desc" name="description" />
              </Field>
            </ActionForm>
          </Section>
        </>
      )}

      <p className="text-muted">
        <Meta items={["Every view of this page is logged", "Teachers see only their own reports"]} />
      </p>
      <ExportPanel dataset="incidents" roles={session.roles} />
    </>
  );
}
