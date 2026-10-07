import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { sections } from "@/db/schema";
import { currentYear } from "@/lib/schedule";
import { currentSchool } from "@/lib/session";
import { Callout, Panel } from "@/components/ui";
import { EnrolForm } from "./form";

export const metadata = { title: "Apply for enrolment" };

export default async function EnrolPage() {
  const school = await currentSchool();
  if (!school) notFound();
  const levels = await withTenant(school.id, async (tx) => {
    const year = await currentYear(tx, school.id);
    if (!year) return [];
    const rows = await tx
      .selectDistinct({ level: sections.level })
      .from(sections)
      .where(eq(sections.schoolYearId, year.id))
      .orderBy(asc(sections.level));
    return rows.map((r) => r.level).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  });
  const open = school.enrolmentOpen && school.status !== "suspended";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[44rem] flex-col justify-center px-[var(--gutter)] py-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Apply to {school.name}</h1>
      <p className="mb-6 mt-1 max-w-[56ch] text-muted">
        For a new learner or a transferee. The registrar reviews each application and contacts you. Already
        applied? <Link href="/enrol/status">Check an application</Link>.
      </p>
      <Panel>
        {open && levels.length > 0 ? (
          <EnrolForm levels={levels} schoolName={school.name} />
        ) : (
          <Callout tone="warn" title="Applications are closed">
            {school.name} is not taking applications online right now. Contact the school office
            {school.phone ? ` at ${school.phone}` : ""}.
          </Callout>
        )}
      </Panel>
    </div>
  );
}
