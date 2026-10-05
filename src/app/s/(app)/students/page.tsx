import Link from "next/link";
import { asc, count, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { enrollments, sections, students } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import {
  Button,
  EmptyState,
  Input,
  Meta,
  PageHeader,
  Pill,
  Section,
  Table,
} from "@/components/ui";

export const metadata = { title: "Students" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { school, session } = await requirePermission("students.view");
  const { q } = await searchParams;
  const canSeeCodes = session.roles.some((r) => r === "school_admin" || r === "registrar");

  const { rows, total } = await withTenant(school.id, async (tx) => ({
    rows: await tx
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
    total: Number(
      (await tx.select({ n: count() }).from(students).where(eq(students.schoolId, school.id)))[0]
        ?.n ?? 0,
    ),
  }));

  const unclaimed = rows.filter((r) => !r.claimedAt).length;

  return (
    <>
      <PageHeader
        title="Students"
        meta={
          <Meta
            items={[
              `${total.toLocaleString("en-PH")} on file`,
              q ? `${rows.length} match “${q}”` : null,
              unclaimed > 0 ? `${unclaimed} have not claimed an account` : null,
            ]}
          />
        }
      />

      <Section title="Find a student">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1">
            <span className="mb-1.5 block text-sm font-medium">Name or student ID</span>
            <Input name="q" defaultValue={q ?? ""} placeholder="Type a surname" />
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </Section>

      <Section
        title="Class list"
        subtitle={
          canSeeCodes
            ? "Codes are printed and handed out on paper, never emailed. A claimed ID cannot be claimed again."
            : undefined
        }
        flush={rows.length > 0}
      >
        {rows.length === 0 ? (
          <EmptyState title={q ? "No student matches that" : "No students yet"}>
            {q ? (
              <>Check the spelling, or clear the search to see all {total}.</>
            ) : (
              <>
                <Link href="/setup#import" className="font-medium underline underline-offset-2">
                  Import them from a spreadsheet
                </Link>{" "}
                and each one gets an activation code to claim their account.
              </>
            )}
          </EmptyState>
        ) : (
          <Table
            head={[
              "Student",
              "ID",
              "Section",
              "Account",
              ...(canSeeCodes ? ["Activation code", "Parent code"] : []),
            ]}
            minWidth={canSeeCodes ? 760 : 520}
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="text-left font-medium">
                  {r.lastName}, {r.firstName}
                </th>
                <td className="text-muted">{r.studentNumber}</td>
                <td>{r.level ? `${r.level} ${r.section}` : "—"}</td>
                <td>
                  {r.claimedAt ? <Pill tone="ok">Claimed</Pill> : <Pill>Not claimed</Pill>}
                </td>
                {canSeeCodes && (
                  <>
                    <td className="font-mono tracking-[0.06em]">
                      {r.claimedAt ? "—" : r.activationCode}
                    </td>
                    <td className="font-mono tracking-[0.06em]">{r.parentCode}</td>
                  </>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
