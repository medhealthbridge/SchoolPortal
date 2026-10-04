import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { enrollments, sections, students } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { Section, Table } from "@/components/ui";

export const metadata = { title: "Students" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { school, session } = await requirePermission("students.view");
  const { q } = await searchParams;
  const canSeeCodes = session.roles.some((r) => r === "school_admin" || r === "registrar");

  const rows = await withTenant(school.id, (tx) =>
    tx
      .select({
        id: students.id,
        studentNumber: students.studentNumber,
        firstName: students.firstName,
        lastName: students.lastName,
        activationCode: students.activationCode,
        parentCode: students.parentCode,
        claimedAt: students.claimedAt,
        level: sections.level,
        section: sections.name,
      })
      .from(students)
      .leftJoin(enrollments, eq(enrollments.studentId, students.id))
      .leftJoin(sections, eq(sections.id, enrollments.sectionId))
      .where(
        q
          ? sql`${students.schoolId} = ${school.id} and (${students.studentNumber} ilike ${"%" + q + "%"} or ${students.lastName} ilike ${"%" + q + "%"} or ${students.firstName} ilike ${"%" + q + "%"})`
          : eq(students.schoolId, school.id),
      )
      .orderBy(asc(students.lastName), asc(students.firstName))
      .limit(500),
  );

  return (
    <Section
      title="Students"
      subtitle={`${rows.length} shown${canSeeCodes ? ". Codes are printed and handed out on paper, never emailed." : ""}`}
    >
      <form method="get" className="mb-4">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or student ID"
          className="w-full max-w-sm rounded-[2px] border border-[var(--rule)] border-b-2 border-b-[var(--ink-soft)] bg-[var(--paper-raised)] px-3 py-2 text-sm"
        />
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">
          No students yet.{" "}
          <Link href="/setup#import" className="font-medium text-[var(--brand)] underline underline-offset-2">
            Import them from a spreadsheet
          </Link>
          , and each one gets an activation code to claim their account.
        </p>
      ) : (
        <Table
          head={[
            "Student",
            "ID",
            "Section",
            "Account",
            ...(canSeeCodes ? ["Activation code", "Parent code"] : []),
          ]}
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-5 font-medium">
                {r.lastName}, {r.firstName}
              </td>
              <td className="py-2 pr-5 tabular-nums">{r.studentNumber}</td>
              <td className="py-2 pr-5">
                {r.level ? `${r.level} ${r.section}` : "—"}
              </td>
              <td className="py-2 pr-5">
                {r.claimedAt ? "Claimed" : "Not claimed"}
              </td>
              {canSeeCodes && (
                <>
                  <td className="py-2 pr-5 font-mono text-[0.8125rem] tracking-[0.06em]">
                    {r.claimedAt ? "—" : r.activationCode}
                  </td>
                  <td className="py-2 pr-5 font-mono text-[0.8125rem] tracking-[0.06em]">{r.parentCode}</td>
                </>
              )}
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}
