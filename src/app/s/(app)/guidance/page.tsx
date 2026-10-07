import { asc, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { appointments, caseNotes, guidanceCases, students, users } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { ActionForm } from "@/components/action-form";
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
  StatGrid,
  StatTile,
  Table,
  Textarea,
} from "@/components/ui";
import { prettyDate, prettyTime, todayIso } from "@/lib/format";
import { addCaseNote, openCase, scheduleAppointment, setCaseStatus } from "./actions";

export const metadata = { title: "Guidance" };

const STATUS_TONE = { open: "warn", monitoring: "neutral", closed: "ok" } as const;

export default async function GuidancePage() {
  const { school, session } = await requirePermission("guidance.manage");

  const data = await withTenant(school.id, async (tx) => {
    // Opening this page is a sensitive view, so it is logged like a change.
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "guidance.caseload_viewed",
    });

    return {
      cases: await tx
        .select({
          row: guidanceCases,
          firstName: students.firstName,
          lastName: students.lastName,
          studentNumber: students.studentNumber,
          counselor: users.name,
        })
        .from(guidanceCases)
        .innerJoin(students, eq(students.id, guidanceCases.studentId))
        .leftJoin(users, eq(users.id, guidanceCases.openedByUserId))
        .where(eq(guidanceCases.schoolId, school.id))
        .orderBy(desc(guidanceCases.openedAt))
        .limit(100),
      notes: await tx
        .select()
        .from(caseNotes)
        .where(eq(caseNotes.schoolId, school.id))
        .orderBy(desc(caseNotes.createdAt))
        .limit(20),
      upcoming: await tx
        .select({
          appointment: appointments,
          firstName: students.firstName,
          lastName: students.lastName,
        })
        .from(appointments)
        .innerJoin(guidanceCases, eq(guidanceCases.id, appointments.caseId))
        .innerJoin(students, eq(students.id, guidanceCases.studentId))
        .where(eq(appointments.schoolId, school.id))
        .orderBy(asc(appointments.onDate))
        .limit(20),
    };
  });

  const open = data.cases.filter((c) => c.row.status === "open");
  const referred = data.cases.filter((c) => c.row.source !== "walk_in");

  return (
    <>
      <PageHeader title="Guidance" meta={`${data.cases.length} cases, ${open.length} open`} />

      <Callout tone="info" title="Confidential">
        Only this office reaches these records. Every opening of this page, and every note, is
        written to the audit log with your name on it.
      </Callout>

      <StatGrid>
        <StatTile label="Open" value={open.length} caption="Still being worked" />
        <StatTile
          label="Referred in"
          value={referred.length}
          caption="Someone else raised it, not a walk-in"
        />
        <StatTile label="Appointments" value={data.upcoming.length} caption="Scheduled" />
      </StatGrid>

      <Section title="Caseload" flush={data.cases.length > 0}>
        {data.cases.length === 0 ? (
          <EmptyState title="No cases yet">
            A three-day absence streak, a failing grade or a repeat discipline case opens one
            here by itself, when those modules are on.
          </EmptyState>
        ) : (
          <Table head={["Opened", "Student", "Case", "Came from", "Status", ""]} minWidth={820}>
            {data.cases.map((c) => (
              <tr key={c.row.id}>
                <td className="whitespace-nowrap text-muted">
                  {prettyDate(c.row.openedAt.toISOString().slice(0, 10))}
                </td>
                <th scope="row" className="text-left font-medium">
                  {c.lastName}, {c.firstName}
                  <span className="block text-[13px] font-normal text-muted">
                    {c.studentNumber}
                  </span>
                </th>
                <td className="max-w-[28ch] truncate">{c.row.title}</td>
                <td className="text-muted">{c.row.source.replace(/_/g, " ")}</td>
                <td>
                  <Pill tone={STATUS_TONE[c.row.status]}>{c.row.status}</Pill>
                </td>
                <td>
                  <form action={setCaseStatus} className="flex gap-1">
                    <input type="hidden" name="caseId" value={c.row.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={c.row.status === "closed" ? "open" : "closed"}
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      {c.row.status === "closed" ? "Reopen" : "Close"}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Open a case">
        <ActionForm action={openCase} submitLabel="Open the case">
          <Field label="Student ID" htmlFor="gc-student">
            <Input id="gc-student" name="studentNumber" required placeholder="ST-2026-0001" />
          </Field>
          <Field label="What it is about" htmlFor="gc-title">
            <Input id="gc-title" name="title" required placeholder="Repeated absences" />
          </Field>
          <Field label="Came from" htmlFor="gc-source">
            <Select id="gc-source" name="source" defaultValue="walk_in">
              <option value="walk_in">Walk-in</option>
              <option value="teacher_referral">Teacher referral</option>
              <option value="parent_request">Parent request</option>
              <option value="attendance">Attendance flag</option>
              <option value="discipline">Discipline referral</option>
            </Select>
          </Field>
        </ActionForm>
      </Section>

      {data.cases.length > 0 && (
        <>
          <Section title="Add a note" subtitle="Notes stay inside this office.">
            <ActionForm action={addCaseNote} submitLabel="Save note" className="grid gap-4">
              <Field label="Case" htmlFor="cn-case">
                <Select id="cn-case" name="caseId" required defaultValue="">
                  <option value="">Choose…</option>
                  {data.cases.map((c) => (
                    <option key={c.row.id} value={c.row.id}>
                      {c.lastName}, {c.firstName} — {c.row.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note" htmlFor="cn-body">
                <Textarea id="cn-body" name="body" rows={3} required />
              </Field>
            </ActionForm>
          </Section>

          <Section title="Schedule an appointment">
            <ActionForm action={scheduleAppointment} submitLabel="Schedule it">
              <Field label="Case" htmlFor="ap-case">
                <Select id="ap-case" name="caseId" required defaultValue="">
                  <option value="">Choose…</option>
                  {data.cases.map((c) => (
                    <option key={c.row.id} value={c.row.id}>
                      {c.lastName}, {c.firstName} — {c.row.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" htmlFor="ap-date">
                <Input id="ap-date" name="onDate" type="date" defaultValue={todayIso()} required />
              </Field>
              <Field label="Time" htmlFor="ap-time">
                <Input id="ap-time" name="atTime" type="time" required />
              </Field>
              <Field label="Note" htmlFor="ap-note">
                <Input id="ap-note" name="note" />
              </Field>
            </ActionForm>
          </Section>
        </>
      )}

      {data.upcoming.length > 0 && (
        <Section title="Appointments" flush>
          <Table head={["When", "Student", "Note"]} minWidth={480}>
            {data.upcoming.map((a) => (
              <tr key={a.appointment.id}>
                <td className="whitespace-nowrap">
                  {prettyDate(a.appointment.onDate)} {prettyTime(a.appointment.atTime)}
                </td>
                <th scope="row" className="text-left font-medium">
                  {a.lastName}, {a.firstName}
                </th>
                <td className="text-muted">{a.appointment.note ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {data.notes.length > 0 && (
        <Section title="Recent notes">
          <ul className="-mx-1">
            {data.notes.slice(0, 8).map((n, i) => (
              <li key={n.id} className={`px-1 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                <p className="max-w-[72ch] whitespace-pre-line">{n.body}</p>
                <div className="mt-1">
                  <Meta items={[n.createdAt.toLocaleString("en-PH")]} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
