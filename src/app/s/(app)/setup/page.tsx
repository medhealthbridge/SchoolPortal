import { and, asc, count, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  rooms,
  schoolYears,
  sections,
  students,
  subjects,
  timetableSlots,
  userRoles,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import {
  Field,
  Input,
  LinkButton,
  PageHeader,
  Pill,
  Section,
  Select,
  Table,
} from "@/components/ui";
import { WEEKDAYS, prettyTime } from "@/lib/format";
import {
  addRoom,
  addSection,
  addSubject,
  addTimetableSlot,
  createSchoolYear,
  importStudents,
} from "./actions";

export const metadata = { title: "Setup" };

export default async function SetupPage() {
  const { school } = await requirePermission("sections.manage");

  const data = await withTenant(school.id, async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    return {
      year: year ?? null,
      sections: await tx
        .select()
        .from(sections)
        .where(eq(sections.schoolId, school.id))
        .orderBy(asc(sections.level), asc(sections.name)),
      subjects: await tx
        .select()
        .from(subjects)
        .where(eq(subjects.schoolId, school.id))
        .orderBy(asc(subjects.code)),
      rooms: await tx.select().from(rooms).where(eq(rooms.schoolId, school.id)),
      teachers: await tx
        .selectDistinct({ id: users.id, name: users.name })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(eq(users.schoolId, school.id))
        .orderBy(asc(users.name)),
      slots: await tx
        .select({
          id: timetableSlots.id,
          weekday: timetableSlots.weekday,
          startsAt: timetableSlots.startsAt,
          endsAt: timetableSlots.endsAt,
          subject: subjects.name,
          level: sections.level,
          section: sections.name,
          teacher: users.name,
          room: rooms.name,
        })
        .from(timetableSlots)
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
        .innerJoin(users, eq(users.id, timetableSlots.teacherUserId))
        .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
        .where(eq(timetableSlots.schoolId, school.id))
        .orderBy(asc(timetableSlots.weekday), asc(timetableSlots.startsAt)),
      studentCount: (
        await tx
          .select({ n: count() })
          .from(students)
          .where(eq(students.schoolId, school.id))
      )[0]?.n,
    };
  });

  const checklist = [
    { label: "Verify the owner's email", done: school.emailVerifiedAt !== null, href: null },
    { label: "Set the school year", done: data.year !== null, href: "#year" },
    { label: "Add your sections", done: data.sections.length > 0, href: "#sections" },
    {
      label: "Add subjects and rooms",
      done: data.subjects.length > 0 && data.rooms.length > 0,
      href: "#subjects",
    },
    {
      label: "Import your students",
      done: Number(data.studentCount ?? 0) > 0,
      href: "#import",
    },
    { label: "Build the timetable", done: data.slots.length > 0, href: "#timetable" },
    {
      label: "Invite your staff",
      done: data.teachers.length > 1,
      href: "/people",
    },
  ];
  const left = checklist.filter((c) => !c.done);

  return (
    <>
      <PageHeader
        title="Setup"
        meta={
          left.length === 0
            ? "Everything is in place."
            : `${left.length} of ${checklist.length} steps left before teachers can start.`
        }
      />

      <Section
        title="Before you go live"
        subtitle={
          left.length === 0
            ? "Teachers can take attendance today."
            : "Each unfinished step opens the part of this page that does it."
        }
      >
        <ol className="-mx-1">
          {checklist.map((c, i) => (
            <li
              key={c.label}
              className={`flex min-h-11 items-center gap-3 px-1 py-2 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <span
                aria-hidden
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[11px] font-bold text-white"
                style={{ background: c.done ? "var(--ok)" : "var(--line-strong)" }}
              >
                {c.done ? "\u2713" : i + 1}
              </span>
              {c.done || !c.href ? (
                <span className={c.done ? "text-muted" : ""}>{c.label}</span>
              ) : (
                <Link href={c.href} className="font-medium underline underline-offset-2">
                  {c.label}
                </Link>
              )}
              <span className="ml-auto">
                {c.done ? <Pill tone="ok">Done</Pill> : <Pill>To do</Pill>}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="year"
        title="School year"
        subtitle={
          data.year
            ? `${data.year.name}, running ${data.year.startsOn} to ${data.year.endsOn}`
            : "Enrollment is per school year, so a transfer never rewrites history."
        }
      >
        <ActionForm action={createSchoolYear} submitLabel="Set as current year">
          <Field label="Name">
            <Input name="name" placeholder="2026–2027" required />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <Input type="date" name="startsOn" required />
            </Field>
            <Field label="Ends">
              <Input type="date" name="endsOn" required />
            </Field>
          </div>
        </ActionForm>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section id="sections" title="Sections" subtitle={`${data.sections.length} so far`}>
          <ActionForm action={addSection} submitLabel="Add section">
            <Field label="Level">
              <Input name="level" placeholder="Grade 7" required />
            </Field>
            <Field label="Name">
              <Input name="name" placeholder="Sampaguita" required />
            </Field>
          </ActionForm>
          {data.sections.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {data.sections.map((s) => (
                <li key={s.id} className="rounded-[var(--r-pill)] border border-line bg-subtle px-2.5 py-0.5 text-xs font-medium">
                  {s.level} {s.name}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="subjects" title="Subjects" subtitle={`${data.subjects.length} so far`}>
          <ActionForm action={addSubject} submitLabel="Add subject">
            <Field label="Code">
              <Input name="code" placeholder="MATH7" required />
            </Field>
            <Field label="Name">
              <Input name="name" placeholder="Mathematics 7" required />
            </Field>
          </ActionForm>
          {data.subjects.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {data.subjects.map((s) => (
                <li key={s.id} className="rounded-[var(--r-pill)] border border-line bg-subtle px-2.5 py-0.5 text-xs font-medium">
                  {s.code}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="rooms" title="Rooms" subtitle="The grid is the seat plan's shape.">
          <ActionForm action={addRoom} submitLabel="Add room">
            <Field label="Name">
              <Input name="name" placeholder="Room 201" required />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Rows">
                <Input type="number" name="rows" defaultValue={5} min={1} max={12} />
              </Field>
              <Field label="Columns">
                <Input type="number" name="cols" defaultValue={6} min={1} max={12} />
              </Field>
            </div>
          </ActionForm>
          {data.rooms.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {data.rooms.map((r) => (
                <li key={r.id} className="rounded-[var(--r-pill)] border border-line bg-subtle px-2.5 py-0.5 text-xs font-medium">
                  {r.name}, {r.rows}×{r.cols}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          id="import"
          title="Import students"
          subtitle="CSV columns: student_number, first_name, last_name, section"
        >
          <ActionForm action={importStudents} submitLabel="Import" className="grid gap-3">
            <Field label="CSV file" hint="Errors are shown before anything is saved.">
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                className="block w-full max-w-full text-sm"
              />
            </Field>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">
            {Number(data.studentCount ?? 0)} students on file. Each import generates
            an activation code and a separate parent code per student.
          </p>
        </Section>
      </div>

      <Section id="timetable" title="Timetable" subtitle="This is what lets attendance open the right class.">
        <ActionForm action={addTimetableSlot} submitLabel="Add class" className="grid gap-3 sm:grid-cols-3">
          <Field label="Teacher">
            <Select name="teacherUserId" required>
              <option value="">Choose…</option>
              {data.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject">
            <Select name="subjectId" required>
              <option value="">Choose…</option>
              {data.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Section">
            <Select name="sectionId" required>
              <option value="">Choose…</option>
              {data.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.level} {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Room">
            <Select name="roomId">
              <option value="">No room</option>
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Day">
            <Select name="weekday" defaultValue="1">
              {WEEKDAYS.slice(1).map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <Input type="time" name="startsAt" required />
            </Field>
            <Field label="Ends">
              <Input type="time" name="endsAt" required />
            </Field>
          </div>
        </ActionForm>

        {data.slots.length > 0 && (
          <div className="mt-5">
            <Table head={["Day", "Time", "Class", "Teacher", "Room"]}>
              {data.slots.map((s) => (
                <tr key={s.id}>
                  <td>{WEEKDAYS[s.weekday]}</td>
                  <td className="tabular-nums">
                    {prettyTime(s.startsAt)}–{prettyTime(s.endsAt)}
                  </td>
                  <td>
                    {s.subject}, {s.level} {s.section}
                  </td>
                  <td>{s.teacher}</td>
                  <td>{s.room ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Section>
    </>
  );
}
