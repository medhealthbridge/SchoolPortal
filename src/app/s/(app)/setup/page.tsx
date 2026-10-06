import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
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
import { can } from "@/lib/roles";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field, Input, PageHeader, Pill, Section } from "@/components/ui";
import {
  addRoom,
  addSection,
  addSubject,
  createSchoolYear,
  saveLogo,
  saveProfile,
} from "./actions";
import { BrandColorField } from "./brand-color";

export const metadata = { title: "Setup" };

export default async function SetupPage() {
  const { school, session } = await requirePermission("sections.manage");
  // The registrar may build the timetable but may not rename the school, and a
  // form whose save button is refused is worse than no form.
  const mayEditSchool = can(session.roles, "school.manage");
  const mayManageStudents = can(session.roles, "students.manage");

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
        .where(and(eq(users.schoolId, school.id), inArray(userRoles.role, ["teacher", "adviser"])))
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
        .where(and(eq(timetableSlots.schoolId, school.id), isNull(timetableSlots.retiredAt)))
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
      href: "/students",
    },
    {
      label: "Add your teachers",
      done: data.teachers.length > 0,
      href: "/teachers",
    },
    { label: "Build the class schedule", done: data.slots.length > 0, href: "/schedule" },
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

      {mayEditSchool && (
        <>
          <Section
            id="profile"
            title="School profile"
            subtitle={`Your address on the internet is ${school.subdomain}, and it stays as it is.`}
          >
            <ActionForm action={saveProfile} submitLabel="Save profile" className="grid gap-4 sm:grid-cols-2">
              <Field label="School name">
                <Input
                  name="name"
                  defaultValue={school.name}
                  required
                  maxLength={120}
                  autoComplete="organization"
                />
              </Field>
              <Field label="Phone" hint="Optional. Shown with the address on report cards.">
                <Input
                  name="phone"
                  type="tel"
                  defaultValue={school.phone ?? ""}
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="(02) 8123 4567"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address" hint="Optional. One line, as you would put it on a letter.">
                  <Input
                    name="address"
                    defaultValue={school.address ?? ""}
                    maxLength={240}
                    autoComplete="street-address"
                    placeholder="Rizal Avenue, Barangay San Roque, Cebu City"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Brand colour"
                  hint="Colours the badge in the corner and on the sign-in page. The letters on it switch between light and dark so they stay readable."
                >
                  <BrandColorField
                    name="primaryColor"
                    initial={school.primaryColor}
                    schoolName={school.name}
                  />
                </Field>
              </div>
            </ActionForm>
          </Section>

          <Section
            id="logo"
            title="Logo"
            subtitle={
              school.logoUrl
                ? "It shows in the corner of every screen."
                : "Until there is one, the badge shows the school's initials."
            }
          >
            <div className="flex flex-wrap items-start gap-6">
              {school.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={school.logoUrl}
                  alt={`${school.name} logo`}
                  className="h-20 w-20 rounded-control border border-line bg-surface object-contain"
                />
              )}
              <div className="min-w-0 flex-1 basis-[18rem]">
                <ActionForm action={saveLogo} submitLabel="Save logo" className="grid gap-3">
                  <Field label="Image" hint="PNG, JPEG or WebP, up to 2 MB. A square reads best.">
                    <Input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required />
                  </Field>
                </ActionForm>
                {school.logoUrl && (
                  <div className="mt-3">
                    <ActionForm action={saveLogo} submitLabel="Remove logo" className="hidden">
                      <input type="hidden" name="remove" value="yes" />
                    </ActionForm>
                  </div>
                )}
              </div>
            </div>
          </Section>
        </>
      )}

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
          title="Students"
          subtitle="The registrar keeps student records: adding, editing and importing them."
        >
          <p className="text-sm">
            {Number(data.studentCount ?? 0)} students on file.{" "}
            <Link href="/students" className="font-medium underline underline-offset-2">
              Open Students
            </Link>
            {mayManageStudents
              ? " to add or import them."
              : " to see them. To add students, give the registrar role to whoever keeps your records, from People."}
          </p>
        </Section>
      </div>

      <Section
        id="timetable"
        title="Class schedule"
        subtitle="Which teacher teaches which subject to which section, in which room and when. It is what lets attendance open the right class."
      >
        <p className="text-sm">
          {data.slots.length} {data.slots.length === 1 ? "class" : "classes"} a week on the schedule.{" "}
          <Link href="/schedule" className="font-medium underline underline-offset-2">
            Open Schedule
          </Link>{" "}
          to add classes, change them and name each section's adviser.
        </p>
      </Section>
    </>
  );
}
