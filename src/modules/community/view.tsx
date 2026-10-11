import { asc, count, desc, eq, sql, and } from "drizzle-orm";
import { withTenant } from "@/db";
import { sections, serviceHours } from "@/db/schema";
import { activitiesWithCredits, clubsWithMembers } from "./queries";
import { ActionForm } from "@/components/action-form";
import {
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
import { prettyDate, todayIso } from "@/lib/format";
import { addClubMembers, createActivity, createClub, creditSection } from "./actions";

/**
 * SAO and Chaplain are the same screen over the same tables, differing in
 * which activities they show and whether clubs appear. Keeping one component
 * means a fix to either lands in both.
 */
export async function CommunityPage({
  schoolId,
  kind,
  title,
  blurb,
  withClubs,
}: {
  schoolId: string;
  kind: "sao_event" | "ministry";
  title: string;
  blurb: string;
  withClubs: boolean;
}) {
  const data = await withTenant(schoolId, async (tx) => ({
    activities: await activitiesWithCredits(tx, schoolId, kind),
    sectionList: await tx
      .select({ id: sections.id, level: sections.level, name: sections.name })
      .from(sections)
      .where(eq(sections.schoolId, schoolId))
      .orderBy(asc(sections.level), asc(sections.name)),
    clubs: withClubs ? await clubsWithMembers(tx, schoolId) : [],
    hours: await tx
      .select({ total: sql<number>`coalesce(sum(${serviceHours.hours}), 0)`, n: count() })
      .from(serviceHours)
      .where(eq(serviceHours.schoolId, schoolId)),
  }));

  const totalHours = Number(data.hours[0]?.total ?? 0);
  const credits = Number(data.hours[0]?.n ?? 0);
  const noun = kind === "ministry" ? "activity" : "event";

  return (
    <>
      <PageHeader title={title} meta={blurb} />

      <StatGrid>
        <StatTile
          label={kind === "ministry" ? "Activities" : "Events"}
          value={data.activities.length}
          caption="Most recent 50"
        />
        <StatTile
          label="Service hours credited"
          value={totalHours.toLocaleString("en-PH")}
          caption={`Across ${credits} student credits`}
        />
        {withClubs && (
          <StatTile
            label="Clubs"
            value={data.clubs.length}
            caption={`${data.clubs.reduce((n, c) => n + Number(c.members), 0)} memberships`}
          />
        )}
      </StatGrid>

      <Section
        title={kind === "ministry" ? "Ministry activities" : "Events"}
        subtitle="Hours credited here are printed on the report card when Grades is on."
        flush={data.activities.length > 0}
      >
        {data.activities.length === 0 ? (
          <EmptyState title={`No ${noun} yet`}>
            Add one below, then credit a section for attending it.
          </EmptyState>
        ) : (
          <Table head={["Date", "Name", "Where", "Hours each", "Credited"]} minWidth={640}>
            {data.activities.map((a) => (
              <tr key={a.row.id}>
                <td className="whitespace-nowrap text-muted">{prettyDate(a.row.onDate)}</td>
                <th scope="row" className="text-left font-medium">
                  {a.row.name}
                </th>
                <td className="text-muted">{a.row.location ?? "—"}</td>
                <td>{a.row.serviceHours}</td>
                <td>
                  {Number(a.credited) > 0 ? (
                    <Pill tone="ok">{a.credited} students</Pill>
                  ) : (
                    <Pill>Nobody yet</Pill>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Add ${kind === "ministry" ? "an activity" : "an event"}`}>
        <ActionForm action={createActivity} submitLabel={`Save ${noun}`}>
          <input type="hidden" name="kind" value={kind} />
          <Field label="Name" htmlFor="ac-name">
            <Input
              id="ac-name"
              name="name"
              required
              placeholder={kind === "ministry" ? "First Friday mass" : "Clean-up drive"}
            />
          </Field>
          <Field label="Date" htmlFor="ac-date">
            <Input id="ac-date" name="onDate" type="date" defaultValue={todayIso()} required />
          </Field>
          <Field label="Where" htmlFor="ac-where">
            <Input id="ac-where" name="location" />
          </Field>
          <Field label="Service hours each" htmlFor="ac-hours" hint="0 if it earns none.">
            <Input id="ac-hours" name="serviceHours" type="number" min={0} max={24} defaultValue={2} />
          </Field>
        </ActionForm>
      </Section>

      {data.activities.length > 0 && data.sectionList.length > 0 && (
        <Section
          title="Credit a section"
          subtitle="Everyone enrolled in the section gets the activity's hours. Crediting twice does nothing."
        >
          <ActionForm action={creditSection} submitLabel="Credit the hours">
            <input type="hidden" name="kind" value={kind} />
            <Field label={kind === "ministry" ? "Activity" : "Event"} htmlFor="cr-activity">
              <Select id="cr-activity" name="activityId" required defaultValue="">
                <option value="">Choose…</option>
                {data.activities.map((a) => (
                  <option key={a.row.id} value={a.row.id}>
                    {prettyDate(a.row.onDate)} — {a.row.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Section" htmlFor="cr-section">
              <Select id="cr-section" name="sectionId" required defaultValue="">
                <option value="">Choose…</option>
                {data.sectionList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.level} {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </ActionForm>
        </Section>
      )}

      {withClubs && (
        <>
          <Section title="Clubs" flush={data.clubs.length > 0}>
            {data.clubs.length === 0 ? (
              <EmptyState title="No clubs yet">
                Add one below and put students in it by their IDs.
              </EmptyState>
            ) : (
              <Table head={["Club", "Members"]} minWidth={320}>
                {data.clubs.map((c) => (
                  <tr key={c.row.id}>
                    <th scope="row" className="text-left font-medium">
                      {c.row.name}
                    </th>
                    <td>{c.members}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          <Section title="Add a club">
            <ActionForm action={createClub} submitLabel="Save club" className="grid gap-4">
              <Field label="Name" htmlFor="cl-name">
                <Input id="cl-name" name="name" required placeholder="Science Club" />
              </Field>
            </ActionForm>
          </Section>

          {data.clubs.length > 0 && (
            <Section title="Add members">
              <ActionForm action={addClubMembers} submitLabel="Add them" className="grid gap-4">
                <Field label="Club" htmlFor="cm-club">
                  <Select id="cm-club" name="clubId" required defaultValue="">
                    <option value="">Choose…</option>
                    {data.clubs.map((c) => (
                      <option key={c.row.id} value={c.row.id}>
                        {c.row.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Student IDs"
                  htmlFor="cm-ids"
                  hint="Separated by spaces or commas. Nothing is saved if one of them is wrong."
                >
                  <Input id="cm-ids" name="studentNumbers" required placeholder="ST-2026-0001 ST-2026-0002" />
                </Field>
              </ActionForm>
            </Section>
          )}
        </>
      )}
    </>
  );
}
