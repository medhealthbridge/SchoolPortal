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
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, Select, Table } from "@/components/ui";
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
    { label: "Owner email verified", done: school.emailVerifiedAt !== null },
    { label: "Current school year set", done: data.year !== null },
    { label: "Sections created", done: data.sections.length > 0 },
    { label: "Subjects and rooms", done: data.subjects.length > 0 && data.rooms.length > 0 },
    { label: "Students imported", done: Number(data.studentCount ?? 0) > 0 },
    { label: "Timetable built", done: data.slots.length > 0 },
  ];

  return (
    <div className="grid gap-5">
      <Card title="Go-live checklist" subtitle="Finish these and attendance opens by itself.">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span
                aria-hidden
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${
                  c.done ? "bg-[#1f7a4d]" : "bg-black/25"
                }`}
              >
                {c.done ? "✓" : "·"}
              </span>
              <span className={c.done ? "" : "text-black/60 dark:text-white/60"}>{c.label}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="School year"
        subtitle={
          data.year
            ? `Current: ${data.year.name} (${data.year.startsOn} → ${data.year.endsOn})`
            : "Enrollment is per school year, so a transfer never rewrites history."
        }
      >
        <ActionForm action={createSchoolYear} submitLabel="Set as current year">
          <Field label="Name">
            <Input name="name" placeholder="2026–2027" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <Input type="date" name="startsOn" required />
            </Field>
            <Field label="Ends">
              <Input type="date" name="endsOn" required />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Sections" subtitle={`${data.sections.length} so far`}>
          <ActionForm action={addSection} submitLabel="Add section">
            <Field label="Level">
              <Input name="level" placeholder="Grade 7" required />
            </Field>
            <Field label="Name">
              <Input name="name" placeholder="Sampaguita" required />
            </Field>
          </ActionForm>
          {data.sections.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 text-xs">
              {data.sections.map((s) => (
                <li key={s.id} className="rounded-full bg-brand-50 px-3 py-1 text-[#1b3049]">
                  {s.level} {s.name}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Subjects" subtitle={`${data.subjects.length} so far`}>
          <ActionForm action={addSubject} submitLabel="Add subject">
            <Field label="Code">
              <Input name="code" placeholder="MATH7" required />
            </Field>
            <Field label="Name">
              <Input name="name" placeholder="Mathematics 7" required />
            </Field>
          </ActionForm>
          {data.subjects.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 text-xs">
              {data.subjects.map((s) => (
                <li key={s.id} className="rounded-full bg-brand-50 px-3 py-1 text-[#1b3049]">
                  {s.code}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Rooms" subtitle="The grid is the seat plan's shape.">
          <ActionForm action={addRoom} submitLabel="Add room">
            <Field label="Name">
              <Input name="name" placeholder="Room 201" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rows">
                <Input type="number" name="rows" defaultValue={5} min={1} max={12} />
              </Field>
              <Field label="Columns">
                <Input type="number" name="cols" defaultValue={6} min={1} max={12} />
              </Field>
            </div>
          </ActionForm>
          {data.rooms.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 text-xs">
              {data.rooms.map((r) => (
                <li key={r.id} className="rounded-full bg-brand-50 px-3 py-1 text-[#1b3049]">
                  {r.name} · {r.rows}×{r.cols}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Import students"
          subtitle="CSV columns: student_number, first_name, last_name, section"
        >
          <ActionForm action={importStudents} submitLabel="Import" className="grid gap-3">
            <Field label="CSV file" hint="Errors are shown before anything is saved.">
              <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
            </Field>
          </ActionForm>
          <p className="mt-3 text-xs text-black/55 dark:text-white/55">
            {Number(data.studentCount ?? 0)} students on file. Each import generates
            an activation code and a separate parent code per student.
          </p>
        </Card>
      </div>

      <Card title="Timetable" subtitle="This is what lets attendance open the right class.">
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
          <div className="grid grid-cols-2 gap-3">
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
                  <td className="py-2 pr-4">{WEEKDAYS[s.weekday]}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {prettyTime(s.startsAt)}–{prettyTime(s.endsAt)}
                  </td>
                  <td className="py-2 pr-4">
                    {s.subject} · {s.level} {s.section}
                  </td>
                  <td className="py-2 pr-4">{s.teacher}</td>
                  <td className="py-2 pr-4">{s.room ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
