import { withTenant } from "@/db";
import { requirePermission } from "@/lib/guard";
import { planRollover } from "@/lib/rollover";
import { EmptyState, Meta, PageHeader, Section, StatGrid, StatTile, Table } from "@/components/ui";
import { RolloverForm } from "./form";

export const metadata = { title: "Start the next school year" };

/** "2025-2026" → "2026-2027"; dates move a year. */
function suggest(year: { name: string; startsOn: string; endsOn: string }) {
  const bump = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
  const name = year.name.replace(/\d{4}/g, (y) => String(Number(y) + 1));
  return { name: name === year.name ? `${year.name} (next)` : name, startsOn: bump(year.startsOn), endsOn: bump(year.endsOn) };
}

export default async function NewYearPage() {
  const { school } = await requirePermission("sections.manage");
  const plan = await withTenant(school.id, (tx) => planRollover(tx, school.id));

  if (!plan)
    return (
      <>
        <PageHeader title="Start the next school year" />
        <Section>
          <EmptyState title="There is no current school year yet">Set one in Setup first.</EmptyState>
        </Section>
      </>
    );

  const count = (o: string) => plan.lines.filter((l) => l.outcome === o).length;
  return (
    <>
      <PageHeader
        title="Start the next school year"
        meta={<Meta items={[`From ${plan.year.name}`, `${plan.lines.length} learners`, `${plan.sections.length} sections`]} />}
      />
      <StatGrid>
        <StatTile label="Promoted" value={count("promoted")} caption="General average 75 or more, or not graded" />
        <StatTile label="Kept at their level" value={count("retained")} caption="General average below 75" />
        <StatTile label="Graduating" value={count("graduated")} caption={`Passed the top grade`} />
      </StatGrid>
      <Section
        title="What happens"
        subtitle="Each section moves up a level under the same name, and its learners move with it. Last year's grades, attendance and records stay as they are. The schedule is not copied: teachers and rooms change, so build it again in Schedule."
      >
        <RolloverForm suggested={suggest(plan.year)} lines={plan.lines} />
      </Section>
      <Section title="Every learner" flush={plan.lines.length > 0}>
        {plan.lines.length === 0 ? (
          <EmptyState title="Nobody is enrolled this year">The new year starts with last year&apos;s sections, empty.</EmptyState>
        ) : (
          <Table head={["Learner", "Now", "Average", "Next year"]} minWidth={560}>
            {plan.lines.map((l) => (
              <tr key={l.studentId}>
                <th scope="row" className="text-left font-medium">
                  {l.name}
                </th>
                <td>
                  {l.fromLevel} {l.section}
                </td>
                <td>{l.average ?? "—"}</td>
                <td>{l.outcome === "graduated" ? "Graduates" : l.outcome === "retained" ? `Stays in ${l.toLevel}` : `${l.toLevel} ${l.section}`}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
