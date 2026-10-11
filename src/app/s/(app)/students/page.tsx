import Link from "next/link";
import { and, asc, count, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { enrollments, sections, students } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { ActionForm } from "@/components/action-form";
import {
  Button,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Meta,
  PageHeader,
  Pill,
  Section,
  Table,
} from "@/components/ui";
import { addStudent, importStudents } from "./actions";
import { StudentFields } from "./fields";
import { ExportPanel } from "@/components/export-panel";

export const metadata = { title: "Students" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const { school, session } = await requirePermission("students.view");
  const { q, show } = await searchParams;
  const withdrawn = show === "withdrawn";
  const canManage = can(session.roles, "students.manage");
  const canSeeCodes = session.roles.some((r) => r === "school_admin" || r === "registrar");

  const { rows, total, away, sectionList } = await withTenant(school.id, async (tx) => {
    const match = q
      ? sql`(${students.studentNumber} ilike ${"%" + q + "%"} or ${students.lastName} ilike ${"%" + q + "%"} or ${students.firstName} ilike ${"%" + q + "%"} or ${students.lrn} ilike ${"%" + q + "%"})`
      : undefined;
    return {
      rows: await tx
        .select({
          id: students.id,
          studentNumber: students.studentNumber,
          lrn: students.lrn,
          firstName: students.firstName,
          lastName: students.lastName,
          activationCode: students.activationCode,
          parentCode: students.parentCode,
          claimedAt: students.claimedAt,
          archivedAt: students.archivedAt,
          level: sections.level,
          section: sections.name,
        })
        .from(students)
        .leftJoin(enrollments, eq(enrollments.studentId, students.id))
        .leftJoin(sections, eq(sections.id, enrollments.sectionId))
        .where(
          and(
            eq(students.schoolId, school.id),
            withdrawn ? isNotNull(students.archivedAt) : isNull(students.archivedAt),
            match,
          ),
        )
        .orderBy(asc(students.lastName), asc(students.firstName))
        .limit(500),
      total: Number(
        (
          await tx
            .select({ n: count() })
            .from(students)
            .where(and(eq(students.schoolId, school.id), isNull(students.archivedAt)))
        )[0]?.n ?? 0,
      ),
      away: Number(
        (
          await tx
            .select({ n: count() })
            .from(students)
            .where(and(eq(students.schoolId, school.id), isNotNull(students.archivedAt)))
        )[0]?.n ?? 0,
      ),
      sectionList: canManage
        ? await tx
            .select()
            .from(sections)
            .where(eq(sections.schoolId, school.id))
            .orderBy(asc(sections.level), asc(sections.name))
        : [],
    };
  });

  const sectionOptions = sectionList.map((s) => ({ id: s.id, label: `${s.level} ${s.name}` }));
  const unclaimed = withdrawn ? 0 : rows.filter((r) => !r.claimedAt).length;

  return (
    <>
      <PageHeader
        title="Students"
        meta={
          <Meta
            items={[
              `${total.toLocaleString("en-PH")} enrolled`,
              away > 0 ? `${away} withdrawn` : null,
              q ? `${rows.length} match “${q}”` : null,
              unclaimed > 0 ? `${unclaimed} have not claimed an account` : null,
            ]}
          />
        }
        actions={
          canManage ? (
            <LinkButton href="/students/template" variant="secondary" prefetch={false}>
              Download the spreadsheet template
            </LinkButton>
          ) : undefined
        }
      />

      {canManage && (
        <>
          <Section
            id="add"
            title="Add a student"
            subtitle="One at a time. Everything except the name and student number can be filled in later."
          >
            <ActionForm action={addStudent} submitLabel="Add student" className="grid gap-6">
              <StudentFields sections={sectionOptions} />
            </ActionForm>
          </Section>

          <Section
            id="import"
            title="Import from a spreadsheet"
            subtitle="Download the template, fill in one row per student, and upload it. Nothing is saved until every row checks out."
          >
            <ActionForm action={importStudents} submitLabel="Import students" className="grid gap-3">
              <Field label="CSV file" hint="Only student_number, first_name and last_name are required.">
                <input
                  type="file"
                  name="file"
                  accept=".csv,text/csv"
                  required
                  className="block w-full max-w-full text-sm"
                />
              </Field>
            </ActionForm>
          </Section>
        </>
      )}

      <Section title={withdrawn ? "Withdrawn students" : "Find a student"}>
        <form method="get" className="flex flex-wrap items-end gap-3">
          {withdrawn && <input type="hidden" name="show" value="withdrawn" />}
          <label className="block min-w-0 flex-1">
            <span className="mb-1.5 block text-sm font-medium">Name, student ID or LRN</span>
            <Input name="q" defaultValue={q ?? ""} placeholder="Type a surname" />
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {canManage && away > 0 && (
            <LinkButton href={withdrawn ? "/students" : "/students?show=withdrawn"} variant="ghost">
              {withdrawn ? "Show enrolled students" : `Show ${away} withdrawn`}
            </LinkButton>
          )}
        </form>
      </Section>

      <Section
        title="Class list"
        subtitle={
          canSeeCodes && !withdrawn
            ? "Codes are printed and handed out on paper, never emailed. A claimed ID cannot be claimed again."
            : undefined
        }
        flush={rows.length > 0}
      >
        {rows.length === 0 ? (
          <EmptyState title={q ? "No student matches that" : withdrawn ? "No one has withdrawn" : "No students yet"}>
            {q ? (
              <>Check the spelling, or clear the search to see everyone.</>
            ) : canManage && !withdrawn ? (
              <>
                <Link href="#add" className="font-medium underline underline-offset-2">
                  Add the first student
                </Link>{" "}
                or import a spreadsheet; each one gets an activation code to claim their account.
              </>
            ) : withdrawn ? (
              <>Withdrawn students keep their records and show here.</>
            ) : (
              <>The registrar adds students.</>
            )}
          </EmptyState>
        ) : (
          <Table
            head={[
              "Student",
              "ID",
              "Section",
              "Account",
              ...(canSeeCodes && !withdrawn ? ["Activation code", "Parent code"] : []),
            ]}
            minWidth={canSeeCodes && !withdrawn ? 760 : 520}
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="text-left font-medium">
                  <Link
                    href={canManage ? `/students/${r.id}` : `/child/${r.id}`}
                    className="underline underline-offset-2"
                  >
                    {r.lastName}, {r.firstName}
                  </Link>
                </th>
                <td className="text-muted">{r.studentNumber}</td>
                <td>{r.level && !r.archivedAt ? `${r.level} ${r.section}` : "—"}</td>
                <td>
                  {r.archivedAt ? (
                    <Pill>Withdrawn</Pill>
                  ) : r.claimedAt ? (
                    <Pill tone="ok">Claimed</Pill>
                  ) : (
                    <Pill>Not claimed</Pill>
                  )}
                </td>
                {canSeeCodes && !withdrawn && (
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
      <ExportPanel dataset="students" roles={session.roles} />
    </>
  );
}
