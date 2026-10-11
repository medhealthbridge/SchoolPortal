import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolYears } from "@/db/schema";
import { requireModule, requireUser } from "@/lib/guard";
import { permissionsFor } from "@/lib/roles";
import {
  currentPeriod,
  periodProgress,
  periodsFor,
  teachingLoad,
} from "@/modules/grades/queries";
import { todayIso, prettyDate } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Meta,
  PageHeader,
  Pill,
  Section,
  StatGrid,
  StatTile,
  Table,
} from "@/components/ui";
import { addGradingPeriod, closeGradingPeriod } from "./actions";
import { ExportPanel } from "@/components/export-panel";

export const metadata = { title: "Grades" };

export default async function GradesPage() {
  await requireModule("grades");
  const { school, session } = await requireUser();
  const perms = permissionsFor(session.roles);
  if (!perms.has("grades.enter") && !perms.has("grades.view_all")) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  const today = todayIso();

  const data = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    const periods = year ? await periodsFor(tx, school.id, year.id) : [];
    return {
      year,
      periods,
      progress: await Promise.all(
        periods.map((p) => periodProgress(tx, school.id, p.id)),
      ),
      load: perms.has("grades.enter")
        ? await teachingLoad(tx, school.id, session.userId)
        : [],
    };
  });

  const now = currentPeriod(data.periods, today);
  const nowIndex = data.periods.findIndex((p) => p.id === now?.id);
  const nowProgress = nowIndex >= 0 ? data.progress[nowIndex] : null;

  return (
    <>
      <PageHeader
        title="Grades"
        meta={
          <Meta
            items={[
              data.year?.name ?? "No school year set",
              now ? `${now.name} is running` : `${data.periods.length} periods`,
            ]}
          />
        }
      />

      {!data.year && (
        <Section title="No school year yet">
          <EmptyState title="Grades hang off a school year">
            Set the current year in{" "}
            <Link href="/setup#year" className="font-medium underline underline-offset-2">
              Setup
            </Link>{" "}
            and the grading periods follow.
          </EmptyState>
        </Section>
      )}

      {nowProgress && now && (
        <StatGrid>
          <StatTile
            label="Scores entered"
            value={nowProgress.entered.toLocaleString("en-PH")}
            caption={`In ${now.name}`}
          />
          <StatTile
            label="Class average"
            value={nowProgress.mean ?? "—"}
            caption={nowProgress.mean ? "Across every subject entered" : "Nothing entered yet"}
          />
          <StatTile
            label="Below 75"
            value={nowProgress.failing}
            caption="Guidance is told, if it is on"
            pill={nowProgress.failing > 0 ? <Pill tone="warn">Needs a look</Pill> : null}
          />
        </StatGrid>
      )}

      {data.load.length > 0 && (
        <Section
          title="Your classes"
          subtitle={
            now
              ? `Entering scores for ${now.name}.`
              : "Add a grading period before entering scores."
          }
        >
          <ul className="-mx-1">
            {data.load.map((c, i) => (
              <li key={`${c.sectionId}-${c.subjectId}`} className={i > 0 ? "border-t border-line" : ""}>
                <Link
                  href={`/grades/${c.sectionId}/${c.subjectId}`}
                  className="flex min-h-[60px] items-center justify-between gap-4 px-1 py-2.5 no-underline hover:bg-subtle"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{c.subjectName}</span>
                    <Meta items={[`${c.level} ${c.sectionName}`, c.subjectCode]} />
                  </span>
                  <span className="shrink-0 text-muted">Enter scores</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {perms.has("grades.manage_periods") && (
        <>
          <Section
            title="Grading periods"
            subtitle="Closing one freezes its scores and tells the portal the card is ready."
            flush={data.periods.length > 0}
          >
            {data.periods.length === 0 ? (
              <EmptyState title="No grading periods yet">
                Most schools run four. Add the first one below.
              </EmptyState>
            ) : (
              <Table head={["Period", "Runs", "Entered", "Average", "Below 75", "State", ""]} minWidth={760}>
                {data.periods.map((p, i) => (
                  <tr key={p.id}>
                    <th scope="row" className="text-left font-medium">
                      {p.sequence}. {p.name}
                    </th>
                    <td className="whitespace-nowrap text-muted">
                      {prettyDate(p.startsOn)} – {prettyDate(p.endsOn)}
                    </td>
                    <td>{data.progress[i].entered}</td>
                    <td>{data.progress[i].mean ?? "—"}</td>
                    <td>{data.progress[i].failing}</td>
                    <td>
                      {p.closedAt ? <Pill tone="ok">Closed</Pill> : <Pill>Open</Pill>}
                    </td>
                    <td>
                      <form action={closeGradingPeriod}>
                        <input type="hidden" name="gradingPeriodId" value={p.id} />
                        <input type="hidden" name="reopen" value={p.closedAt ? "1" : "0"} />
                        <Button type="submit" variant="secondary" size="sm">
                          {p.closedAt ? "Reopen" : "Close period"}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          <Section title="Add a grading period">
            <ActionForm action={addGradingPeriod} submitLabel="Save period">
              <Field label="Name" htmlFor="gp-name">
                <Input id="gp-name" name="name" placeholder="First quarter" required />
              </Field>
              <Field label="Order" htmlFor="gp-seq" hint="1 for the first quarter, 2 for the second.">
                <Input id="gp-seq" name="sequence" type="number" min={1} max={8} required />
              </Field>
              <Field label="Starts" htmlFor="gp-start">
                <Input id="gp-start" name="startsOn" type="date" required />
              </Field>
              <Field label="Ends" htmlFor="gp-end">
                <Input id="gp-end" name="endsOn" type="date" required />
              </Field>
            </ActionForm>
          </Section>
        </>
      )}
      <ExportPanel dataset="grades" roles={session.roles} />
    </>
  );
}
