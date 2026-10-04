import { asc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { enrollments, sections, students } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { Card, Table } from "@/components/ui";

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
    <Card
      title="Students"
      subtitle={`${rows.length} shown${canSeeCodes ? " · codes are printed and handed out on paper" : ""}`}
    >
      <form method="get" className="mb-4">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or student ID"
          className="w-full max-w-sm rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5"
        />
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No students yet. Import them from Setup.
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
              <td className="py-2 pr-4 font-medium">
                {r.lastName}, {r.firstName}
              </td>
              <td className="py-2 pr-4 tabular-nums">{r.studentNumber}</td>
              <td className="py-2 pr-4">
                {r.level ? `${r.level} ${r.section}` : "—"}
              </td>
              <td className="py-2 pr-4">
                {r.claimedAt ? "Claimed" : "Not claimed"}
              </td>
              {canSeeCodes && (
                <>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {r.claimedAt ? "—" : r.activationCode}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.parentCode}</td>
                </>
              )}
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
