import { asc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { sections } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { applicationsFor, suggestStudentNumber } from "@/lib/enrolment";
import { currentYear } from "@/lib/schedule";
import { schoolUrl } from "@/lib/school-url";
import { Button, EmptyState, Meta, PageHeader, Pill, Section, Segmented } from "@/components/ui";
import { setEnrolmentOpen } from "./actions";
import { Decide } from "./decide";

export const metadata = { title: "Enrolment applications" };

const prettyDate = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });

export default async function EnrolmentsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { school } = await requirePermission("students.manage");
  const asked = (await searchParams).show ?? "";
  const show = ["approved", "declined"].includes(asked) ? asked : "pending";

  const data = await withTenant(school.id, async (tx) => {
    const year = await currentYear(tx, school.id);
    const secs = year
      ? await tx.select().from(sections).where(eq(sections.schoolYearId, year.id)).orderBy(asc(sections.level), asc(sections.name))
      : [];
    return {
      apps: await applicationsFor(tx, school.id, show),
      pending: (await applicationsFor(tx, school.id, "pending")).length,
      sections: secs,
      suggested: await suggestStudentNumber(tx, school.id),
    };
  });

  // Each approval takes the next number; suggest distinct ones down the list.
  const [prefix, seq] = data.suggested.split("-");
  const numberFor = (i: number) => `${prefix}-${String(Number(seq) + i).padStart(4, "0")}`;
  const link = schoolUrl(school.subdomain, "/enrol");

  return (
    <>
      <PageHeader
        title="Enrolment applications"
        meta={<Meta items={[`${data.pending} waiting`, school.enrolmentOpen ? "Online form open" : "Online form closed"]} />}
      />
      <Section
        title={school.enrolmentOpen ? "The online form is open" : "The online form is closed"}
        subtitle={
          school.enrolmentOpen
            ? `Families apply at ${link}. Share it on the school's page or group chat.`
            : "Open it when enrolment starts. Families then apply from the school's address, without an account."
        }
        actions={
          <form action={setEnrolmentOpen}>
            <input type="hidden" name="open" value={school.enrolmentOpen ? "0" : "1"} />
            <Button type="submit" variant={school.enrolmentOpen ? "secondary" : "primary"}>
              {school.enrolmentOpen ? "Close the form" : "Open the form"}
            </Button>
          </form>
        }
      >
        <span className="break-all font-mono text-sm">{link}</span>
      </Section>

      <Segmented
        current={show}
        options={[
          { key: "pending", label: `Waiting (${data.pending})`, href: "/enrolments" },
          { key: "approved", label: "Approved", href: "/enrolments?show=approved" },
          { key: "declined", label: "Declined", href: "/enrolments?show=declined" },
        ]}
      />

      {data.apps.length === 0 ? (
        <Section>
          <EmptyState title={show === "pending" ? "No applications waiting" : `None ${show} yet`}>
            {show === "pending" ? "New applications from the online form land here." : null}
          </EmptyState>
        </Section>
      ) : (
        data.apps.map((a, i) => {
          const l = a.learner as Record<string, string>;
          const name = [l.last_name + ",", l.first_name, l.middle_name, l.suffix].filter(Boolean).join(" ");
          return (
            <Section
              key={a.id}
              title={name}
              subtitle={`${a.gradeLevel} · ref ${a.reference} · applied ${prettyDate(a.createdAt)}`}
              actions={<Pill tone={a.status === "approved" ? "ok" : a.status === "declined" ? "warn" : "neutral"}>{a.status}</Pill>}
            >
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {[
                  ["LRN", l.lrn],
                  ["Birth date", l.birth_date],
                  ["Sex", l.sex],
                  ["Address", l.address],
                  ["Last school", a.previousSchool],
                  ["4Ps", l.four_ps === "yes" ? "Yes" : null],
                  ["Disability or need", l.disability],
                  ["Guardian", [a.guardianName, a.guardianRelationship].filter(Boolean).join(", ")],
                  ["Mobile", a.guardianPhone],
                  ["Email", a.guardianEmail],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2 border-b border-line py-1">
                      <dt className="w-32 shrink-0 text-muted">{k}</dt>
                      <dd className="min-w-0 break-words">{v}</dd>
                    </div>
                  ))}
              </dl>
              {a.decisionNote && <p className="mt-3 text-sm text-muted">Note: {a.decisionNote}</p>}
              {a.status === "pending" && (
                <div className="mt-4">
                  <Decide
                    applicationId={a.id}
                    suggestedNumber={numberFor(i)}
                    sections={data.sections.map((s) => ({ id: s.id, label: `${s.level} ${s.name}`, fits: s.level === a.gradeLevel }))}
                  />
                </div>
              )}
            </Section>
          );
        })
      )}
    </>
  );
}
