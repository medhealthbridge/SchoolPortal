import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolYears, sections, subjects } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { classScores, currentPeriod, periodsFor } from "@/modules/grades/queries";
import { classRecord, mayKeepRecord } from "@/modules/grades/class-record";
import { COMPONENTS, COMPONENT_LABEL, GROUPS } from "@/modules/grades/deped";
import { todayIso } from "@/lib/format";
import { Button, Meta, PageHeader, Pill, Section, Segmented, Select, EmptyState, Table } from "@/components/ui";
import { ChevronLeftIcon } from "@/components/icons";
import ScoreSheet from "./sheet";
import { AddAssessmentForm, PostGradesForm } from "./record-forms";
import { removeAssessment, setGradingGroup } from "../../record-actions";

export const metadata = { title: "Enter scores" };

export default async function ClassScoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ sectionId: string; subjectId: string }>;
  searchParams: Promise<{ period?: string; mode?: string }>;
}) {
  const { school, session } = await requirePermission("grades.enter");
  const { sectionId, subjectId } = await params;
  const sp = await searchParams;
  const direct = sp.mode === "direct";

  const data = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    if (!year) return null;

    const [section] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.id, sectionId)))
      .limit(1);
    const [subject] = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.schoolId, school.id), eq(subjects.id, subjectId)))
      .limit(1);
    if (!section || !subject) return null;

    const periods = await periodsFor(tx, school.id, year.id);
    const chosen =
      periods.find((p) => p.id === sp.period) ?? currentPeriod(periods, todayIso());
    if (!(await mayKeepRecord(tx, school.id, session, sectionId, subjectId))) return null;
    const rows = chosen && direct ? await classScores(tx, school.id, sectionId, subjectId, chosen.id) : [];
    const record = chosen && !direct ? await classRecord(tx, school.id, sectionId, subjectId, chosen.id) : null;
    return { section, subject, periods, chosen, rows, record };
  });

  if (!data) notFound();
  const base = `/grades/${data.section.id}/${data.subject.id}`;
  const q = data.chosen ? `?period=${data.chosen.id}` : "";

  return (
    <>
      <div className="flex items-start gap-1">
        <Link
          href="/grades"
          aria-label="Back to Grades"
          className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink no-underline hover:bg-subtle"
        >
          <ChevronLeftIcon size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={data.subject.name}
            meta={
              <Meta
                items={[
                  `${data.section.level} ${data.section.name}`,
                  data.subject.code,
                  data.chosen?.name ?? "No period",
                ]}
              />
            }
          />
        </div>
      </div>

      {data.periods.length > 1 && (
        <Segmented
          current={data.chosen?.id ?? ""}
          options={data.periods.map((p) => ({
            key: p.id,
            label: p.name,
            href: `/grades/${data.section.id}/${data.subject.id}?period=${p.id}${direct ? "&mode=direct" : ""}`,
          }))}
        />
      )}

      <Segmented
        current={direct ? "direct" : "record"}
        options={[
          { key: "record", label: "Class record", href: `${base}${q}` },
          { key: "direct", label: "Enter grades directly", href: `${base}${q}${q ? "&" : "?"}mode=direct` },
        ]}
      />

      {!data.chosen ? (
        <Section title="No grading period">
          <EmptyState title="Scores need a period to sit in">
            A school admin adds grading periods on the Grades page.
          </EmptyState>
        </Section>
      ) : !direct && data.record ? (
        <ClassRecordView
          base={base}
          sectionId={data.section.id}
          subjectId={data.subject.id}
          period={data.chosen}
          record={data.record}
          mayWeigh={can(session.roles, "grades.manage_periods")}
        />
      ) : data.rows.length === 0 ? (
        <Section title="No students">
          <EmptyState title="Nobody is enrolled in this section yet">
            Import students and enrol them from Setup, and they appear here.
          </EmptyState>
        </Section>
      ) : (
        <ScoreSheet
          subjectId={data.subject.id}
          gradingPeriodId={data.chosen.id}
          periodName={data.chosen.name}
          closed={data.chosen.closedAt !== null}
          rows={data.rows}
        />
      )}
    </>
  );
}

type ClassRecordData = NonNullable<Awaited<ReturnType<typeof classRecord>>>;

function fmt(n: number | null) {
  return n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function ClassRecordView({
  base,
  sectionId,
  subjectId,
  period,
  record,
  mayWeigh,
}: {
  base: string;
  sectionId: string;
  subjectId: string;
  period: { id: string; name: string; closedAt: Date | null };
  record: ClassRecordData;
  mayWeigh: boolean;
}) {
  const closed = period.closedAt !== null;
  const ready = record.rows.filter((r) => r.line.quarterly !== null).length;
  const w = record.weights;
  return (
    <>
      <Section
        title="How this subject is weighted"
        subtitle={`Written Work ${w.ww}%, Performance Tasks ${w.pt}%, Quarterly Assessment ${w.qa}%. DepEd Order 8, s. 2015.`}
      >
        {mayWeigh ? (
          <form action={setGradingGroup} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="back" value={base} />
            <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
              Subject group
              <Select name="gradingGroup" defaultValue={record.group}>
                {Object.entries(GROUPS).map(([key, g]) => (
                  <option key={key} value={key}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="secondary">
              Save weighting
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">{GROUPS[record.group].label}. The school office sets this.</p>
        )}
      </Section>

      <Section
        title={`${record.items.length} ${record.items.length === 1 ? "assessment" : "assessments"} in ${period.name}`}
        subtitle="Each quiz, task and exam with its highest possible score. Open one to enter the learners' raw scores."
        flush={record.items.length > 0}
      >
        {record.items.length === 0 ? (
          <EmptyState title="Nothing given yet this quarter">
            Add the first quiz or task below, then enter the class&apos;s scores.
          </EmptyState>
        ) : (
          <ul>
            {record.items.map((a) => (
              <li key={a.id} className="flex min-h-[60px] flex-wrap items-center gap-3 border-t border-line px-4 py-2 first:border-t-0">
                <a href={`${base}/assessment/${a.id}`} className="min-w-0 flex-1 text-ink">
                  <span className="block truncate font-medium">{a.title}</span>
                  <span className="block text-[13px] text-muted">
                    {COMPONENT_LABEL[a.component]} · out of {fmt(a.highestScore)}
                    {a.givenOn ? ` · ${a.givenOn}` : ""}
                  </span>
                </a>
                <a href={`${base}/assessment/${a.id}`} className="inline-flex h-11 items-center rounded-control border border-line px-3 text-sm font-medium text-ink no-underline shadow-control hover:bg-subtle">
                  Enter scores
                </a>
                {!closed && (
                  <form action={removeAssessment}>
                    <input type="hidden" name="assessmentId" value={a.id} />
                    <Button type="submit" variant="ghost" aria-label={`Remove ${a.title}`}>
                      Remove
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {!closed && (
        <Section title="Add a quiz, task or exam">
          <AddAssessmentForm sectionId={sectionId} subjectId={subjectId} gradingPeriodId={period.id} />
        </Section>
      )}

      <Section
        title="Quarterly grades"
        subtitle="Percentage score per component, weighted, summed to the initial grade, then transmuted. 75 is the pass mark."
        flush={record.rows.length > 0}
        actions={<Pill>{ready} of {record.rows.length} complete</Pill>}
      >
        {record.rows.length === 0 ? (
          <EmptyState title="Nobody is enrolled in this section yet">
            Enrol students from Students, and they appear here.
          </EmptyState>
        ) : (
          <Table
            head={["Learner", ...COMPONENTS.map((c) => `${COMPONENT_LABEL[c]} (${w[c]}%)`), "Initial", "Quarterly"]}
            minWidth={720}
          >
            {record.rows.map((r) => (
              <tr key={r.studentId}>
                <th scope="row" className="text-left font-medium">
                  {r.name}
                  <span className="block text-[13px] font-normal text-muted">{r.studentNumber}</span>
                </th>
                {COMPONENTS.map((c) => (
                  <td key={c}>
                    {fmt(r.line.components[c].ps)}
                    {r.line.components[c].ws !== null && (
                      <span className="block text-[13px] text-muted">WS {fmt(r.line.components[c].ws)}</span>
                    )}
                  </td>
                ))}
                <td>{fmt(r.line.initial)}</td>
                <td
                  className="font-semibold"
                  style={r.line.quarterly !== null && r.line.quarterly < 75 ? { color: "var(--late-fg)" } : undefined}
                >
                  {r.line.quarterly ?? "—"}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {!closed && record.rows.length > 0 && (
        <PostGradesForm
          sectionId={sectionId}
          subjectId={subjectId}
          gradingPeriodId={period.id}
          ready={ready}
          periodName={period.name}
        />
      )}
    </>
  );
}
