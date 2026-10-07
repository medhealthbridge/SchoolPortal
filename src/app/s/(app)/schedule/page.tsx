import Link from "next/link";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { withTenant } from "@/db";
import { rooms, sections, subjects, timetableSlots, userRoles, users } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { permissionsFor } from "@/lib/roles";
import { watchedStudents } from "@/lib/student-access";
import {
  SCHOOL_DAYS,
  currentYear,
  dayName,
  scheduleFor,
  sectionOfStudent,
  type ScheduleEntry,
} from "@/lib/schedule";
import { ActionForm } from "@/components/action-form";
import { ExportPanel } from "@/components/export-panel";
import { WeekView } from "@/components/week-view";
import {
  Button,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Meta,
  PageHeader,
  Section,
  Select,
} from "@/components/ui";
import { removeClass, saveClass, setAdviser } from "./actions";

export const metadata = { title: "Schedule" };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Who teaches what, where and when. The office that builds the schedule
 * (registrar, principal, school admin) works on one section at a time; a
 * teacher sees their own week, and a parent or student the child's.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; edit?: string }>;
}) {
  const { school, session } = await requireUser();
  const perms = permissionsFor(session.roles);
  const manage = perms.has("timetable.manage");
  const sp = await searchParams;

  const data = await withTenant(school.id, async (tx) => {
    const year = await currentYear(tx, school.id);

    const mine = perms.has("attendance.take")
      ? await scheduleFor(tx, school.id, { teacherUserId: session.userId })
      : [];

    const watched = await watchedStudents(tx, school.id, session);
    const children = await Promise.all(
      watched.map(async (s) => {
        const section = await sectionOfStudent(tx, school.id, s.id);
        return {
          student: s,
          section,
          week: section ? await scheduleFor(tx, school.id, { sectionIds: [section.id] }) : [],
        };
      }),
    );

    if (!manage || !year) return { year, mine, children, office: null };

    const sectionList = await tx
      .select({
        id: sections.id,
        level: sections.level,
        name: sections.name,
        adviserUserId: sections.adviserUserId,
      })
      .from(sections)
      .where(and(eq(sections.schoolId, school.id), eq(sections.schoolYearId, year.id)))
      .orderBy(asc(sections.level), asc(sections.name));
    const chosen =
      sectionList.find((s) => s.id === sp.section) ?? sectionList[0] ?? null;

    const teacherRows = await tx
      .selectDistinct({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(
        and(
          eq(users.schoolId, school.id),
          eq(users.status, "active"),
          inArray(userRoles.role, ["teacher", "adviser"]),
        ),
      )
      .orderBy(asc(users.name));

    const editing =
      sp.edit && UUID.test(sp.edit)
        ? (
            await tx
              .select()
              .from(timetableSlots)
              .where(
                and(
                  eq(timetableSlots.schoolId, school.id),
                  eq(timetableSlots.id, sp.edit),
                  isNull(timetableSlots.retiredAt),
                ),
              )
              .limit(1)
          )[0] ?? null
        : null;

    return {
      year,
      mine,
      children,
      office: {
        sections: sectionList,
        chosen,
        week: chosen ? await scheduleFor(tx, school.id, { sectionIds: [chosen.id] }) : [],
        subjects: await tx
          .select()
          .from(subjects)
          .where(eq(subjects.schoolId, school.id))
          .orderBy(asc(subjects.name)),
        rooms: await tx
          .select()
          .from(rooms)
          .where(eq(rooms.schoolId, school.id))
          .orderBy(asc(rooms.name)),
        teachers: teacherRows,
        editing: editing && chosen && editing.sectionId === chosen.id ? editing : null,
      },
    };
  });

  const office = data.office;
  const missing = office
    ? [
        office.sections.length === 0 ? "sections" : null,
        office.subjects.length === 0 ? "subjects" : null,
      ].filter(Boolean)
    : [];

  return (
    <>
      <PageHeader
        title="Schedule"
        meta={
          <Meta
            items={[
              data.year ? `School year ${data.year.name}` : "No school year set",
              office?.chosen ? `${office.chosen.level} ${office.chosen.name}` : null,
            ]}
          />
        }
      />

      {manage && !data.year && (
        <Section title="Set the school year first">
          <EmptyState
            title="The schedule belongs to a school year"
            action={<LinkButton href="/setup">Open Setup</LinkButton>}
          >
            Name the year and mark it current. Then add sections, subjects and rooms.
          </EmptyState>
        </Section>
      )}

      {office && missing.length > 0 && (
        <Section title="A few things come first">
          <EmptyState
            title={`Add your ${missing.join(" and ")} in Setup`}
            action={<LinkButton href="/setup">Open Setup</LinkButton>}
          >
            A class needs a section to meet and a subject to teach.
          </EmptyState>
        </Section>
      )}

      {office && office.teachers.length === 0 && (
        <Section title="No teachers yet">
          <EmptyState
            title="Add teachers before you schedule their classes"
            action={<LinkButton href="/teachers">Open Teachers</LinkButton>}
          />
        </Section>
      )}

      {office && office.chosen && missing.length === 0 && (
        <>
          <Section title="Section">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <label className="block min-w-0 flex-1">
                <span className="mb-1.5 block text-sm font-medium">Show the schedule of</span>
                <Select name="section" defaultValue={office.chosen.id}>
                  {office.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.level} {s.name}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="submit" variant="secondary">
                Show
              </Button>
            </form>
          </Section>

          <Section
            title={`${office.chosen.level} ${office.chosen.name}`}
            subtitle={`${office.week.length} ${office.week.length === 1 ? "class" : "classes"} a week. A class with attendance taken is retired when removed, so its marks stay.`}
          >
            <div className="mb-6">
              <ActionForm
                action={setAdviser}
                submitLabel="Save adviser"
                className="grid gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="sectionId" value={office.chosen.id} />
                <Field label="Adviser" hint="Sees the whole section's attendance and grades.">
                  <Select name="adviserUserId" defaultValue={office.chosen.adviserUserId ?? ""}>
                    <option value="">No adviser yet</option>
                    {office.teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </ActionForm>
            </div>
            <WeekView
              entries={office.week}
              show="teacher"
              empty="Add the first class below. Tick every day it meets and it is added to each."
              actions={(e: ScheduleEntry) => (
                <>
                  <LinkButton
                    href={`/schedule?section=${office.chosen!.id}&edit=${e.id}#class-form`}
                    variant="secondary"
                  >
                    Change
                  </LinkButton>
                  <form action={removeClass}>
                    <input type="hidden" name="id" value={e.id} />
                    <Button type="submit" variant="ghost" aria-label={`Remove ${e.subjectName} on ${dayName(e.weekday)}`}>
                      Remove
                    </Button>
                  </form>
                </>
              )}
            />
          </Section>

          <Section
            id="class-form"
            title={office.editing ? "Change this class" : `Add a class to ${office.chosen.level} ${office.chosen.name}`}
            subtitle={
              office.editing
                ? "Saved only if the teacher, the section and the room are all free at the new time."
                : "Tick every day it meets. Nothing is saved if the teacher, the section or the room is already taken."
            }
          >
            <ActionForm
              key={office.editing?.id ?? "new"}
              action={saveClass}
              submitLabel={office.editing ? "Save changes" : "Add class"}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="sectionId" value={office.chosen.id} />
              {office.editing && <input type="hidden" name="id" value={office.editing.id} />}
              <Field label="Subject">
                <Select name="subjectId" required defaultValue={office.editing?.subjectId ?? ""}>
                  <option value="">Choose…</option>
                  {office.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Teacher">
                <Select name="teacherUserId" required defaultValue={office.editing?.teacherUserId ?? ""}>
                  <option value="">Choose…</option>
                  {office.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Room" hint="Optional. Attendance uses its seat plan.">
                <Select name="roomId" defaultValue={office.editing?.roomId ?? ""}>
                  <option value="">No room</option>
                  {office.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Starts">
                  <Input
                    type="time"
                    name="startsAt"
                    required
                    defaultValue={office.editing?.startsAt.slice(0, 5) ?? ""}
                  />
                </Field>
                <Field label="Ends">
                  <Input
                    type="time"
                    name="endsAt"
                    required
                    defaultValue={office.editing?.endsAt.slice(0, 5) ?? ""}
                  />
                </Field>
              </div>
              <fieldset className="sm:col-span-2">
                <legend className="mb-1.5 text-sm font-medium">
                  {office.editing ? "Day" : "Days"}
                </legend>
                <div className="flex flex-wrap gap-x-5">
                  {SCHOOL_DAYS.map((d) => (
                    <label key={d} className="flex min-h-11 items-center gap-2.5">
                      <input
                        type={office.editing ? "radio" : "checkbox"}
                        name="weekday"
                        value={d}
                        defaultChecked={office.editing?.weekday === d}
                        className="size-5"
                      />
                      <span className="text-sm">{dayName(d)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
            {office.editing && (
              <p className="mt-3 text-sm">
                <Link
                  href={`/schedule?section=${office.chosen.id}`}
                  className="font-medium underline underline-offset-2"
                >
                  Add a new class instead
                </Link>
              </p>
            )}
          </Section>
        </>
      )}

      {data.mine.length > 0 || (perms.has("attendance.take") && !manage) ? (
        <Section
          title="Your week"
          subtitle="The classes you teach. Attendance opens each one at its time."
        >
          <WeekView
            entries={data.mine}
            show="section"
            empty="When the registrar or the principal puts you on the schedule, your classes appear here."
          />
        </Section>
      ) : null}

      {data.children.map(({ student, section, week }) => (
        <Section
          key={student.id}
          title={
            data.children.length === 1 && student.claimedByUserId === session.userId
              ? "Your classes"
              : `${student.firstName}'s classes`
          }
          subtitle={
            section
              ? [
                  `${section.level} ${section.name}`,
                  section.adviserName ? `Adviser: ${section.adviserName}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Not placed in a section yet."
          }
        >
          <WeekView
            entries={week}
            show="teacher"
            empty={
              section
                ? "The school has not put this section's classes on the schedule yet."
                : "The registrar places each student in a section."
            }
          />
        </Section>
      ))}

      {manage && <ExportPanel dataset="schedule" roles={session.roles} />}
    </>
  );
}
