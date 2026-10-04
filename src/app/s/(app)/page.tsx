import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  attendanceRecords,
  notifications,
  studentGuardians,
  students,
  timetableSlots,
} from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { enabledModules } from "@/lib/tenant";
import { permissionsFor } from "@/lib/roles";
import {
  dailySummary,
  slotsForTeacher,
  unsubmittedSlots,
} from "@/modules/attendance/queries";
import { prettyDate, prettyTime, todayIso } from "@/lib/format";
import { Meta, Progress, Section, StatusBadge, Table, Tally } from "@/components/ui";

export const metadata = { title: "Today" };

export default async function Dashboard() {
  const { school, session } = await requireUser();
  const perms = permissionsFor(session.roles);
  const on = await enabledModules(school.id);
  const date = todayIso();
  const weekday = ((new Date().getDay() + 6) % 7) + 1;
  const attendanceOn = on.has("attendance");

  const data = await withTenant(school.id, async (tx) => ({
    summary:
      attendanceOn && perms.has("attendance.view_all")
        ? await dailySummary(tx, school.id, date, weekday)
        : null,
    missing:
      attendanceOn && perms.has("attendance.view_all")
        ? await unsubmittedSlots(tx, school.id, date, weekday)
        : [],
    mySlots:
      attendanceOn && perms.has("attendance.take")
        ? await slotsForTeacher(tx, school.id, session.userId, weekday)
        : [],
    children: perms.has("attendance.view_own_children")
      ? await tx
          .select({ student: students })
          .from(studentGuardians)
          .innerJoin(students, eq(students.id, studentGuardians.studentId))
          .where(eq(studentGuardians.guardianUserId, session.userId))
      : [],
    mine: perms.has("attendance.view_own")
      ? await tx
          .select()
          .from(students)
          .where(
            and(eq(students.schoolId, school.id), eq(students.claimedByUserId, session.userId)),
          )
          .limit(1)
      : [],
    // Whether a timetable exists at all, which is a different question from
    // whether anything is scheduled today.
    timetableSize: Number(
      (
        await tx
          .select({ n: count() })
          .from(timetableSlots)
          .where(eq(timetableSlots.schoolId, school.id))
      )[0]?.n ?? 0,
    ),
    alerts: await tx
      .select()
      .from(notifications)
      .where(eq(notifications.userId, session.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(5),
  }));

  const watched = [...data.children.map((c) => c.student), ...data.mine];
  const recent = watched.length
    ? await withTenant(school.id, (tx) =>
        tx
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.schoolId, school.id),
              eq(attendanceRecords.studentId, watched[0].id),
            ),
          )
          .orderBy(desc(attendanceRecords.onDate))
          .limit(10),
      )
    : [];

  const marksToday =
    (data.summary?.present ?? 0) +
    (data.summary?.absent ?? 0) +
    (data.summary?.late ?? 0) +
    (data.summary?.excused ?? 0);

  const needsSetup =
    perms.has("sections.manage") && attendanceOn && data.timetableSize === 0;
  const noClassesToday = (data.summary?.slotsExpected ?? 0) === 0;

  return (
    <>
      <p className="w-wide text-[1.75rem] font-bold leading-none">
        {new Date().toLocaleDateString("en-PH", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>

      {needsSetup && (
        <Section
          title="Nothing is on the timetable yet"
          subtitle="Attendance opens the right class by itself once the timetable is in. That is the last step before teachers can start."
        >
          <Link
            href="/setup"
            className="inline-block rounded-[2px] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#5c3800]"
          >
            Finish setting up
          </Link>
        </Section>
      )}

      {data.summary && !needsSetup && (
        <Section
          title="The day so far"
          subtitle={
            noClassesToday
              ? "Nothing is scheduled today, so there is nothing to take."
              : marksToday === 0
                ? "No class has submitted yet today."
                : `${marksToday} marks recorded across the school.`
          }
        >
          {marksToday > 0 && (
            <div className="mb-7">
              <Tally counts={data.summary} />
            </div>
          )}
          {!noClassesToday && (
            <Progress
              done={data.summary.slotsSubmitted}
              total={data.summary.slotsExpected}
              label="classes have submitted"
            />
          )}
          {noClassesToday && (
            <p className="text-sm text-[var(--ink-soft)]">
              The next school day picks up where this one left off.{" "}
              <Link
                href="/attendance/report"
                className="font-medium text-[var(--brand)] underline underline-offset-2"
              >
                Look at the month so far
              </Link>
              .
            </p>
          )}
        </Section>
      )}

      {data.missing.length > 0 && (
        <Section
          title="Still to submit"
          subtitle="Classes on today's timetable with nothing recorded."
        >
          <ul className="ledger-rows">
            {data.missing.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline gap-x-5 gap-y-1 py-2.5 text-sm"
              >
                <span className="w-14 shrink-0 font-semibold">{prettyTime(s.startsAt)}</span>
                <span className="font-medium">
                  {s.subjectName}, {s.sectionLevel} {s.sectionName}
                </span>
                <span className="text-[var(--ink-soft)]">{s.teacherName}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.mySlots.length > 0 && (
        <Section title="Your classes today" subtitle="Each one opens on its own seat plan.">
          <ul className="ledger-rows">
            {data.mySlots.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/attendance/${s.id}`}
                  className="flex items-baseline justify-between gap-5 py-3 hover:text-[var(--brand)]"
                >
                  <span>
                    <span className="block font-medium">{s.subjectName}</span>
                    <Meta
                      items={[s.sectionLabel, s.roomName].filter(Boolean) as string[]}
                    />
                  </span>
                  <span className="shrink-0 font-semibold">{prettyTime(s.startsAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {watched.length > 0 && (
        <Section
          title={data.mine.length ? "Your attendance" : "Your children"}
          subtitle={watched.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}
        >
          {recent.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">
              Nothing recorded yet this school year.
            </p>
          ) : (
            <Table head={["Date", "Mark"]}>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-5">{prettyDate(r.onDate)}</td>
                  <td className="py-2 pr-5">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      {data.alerts.length > 0 && (
        <Section title="Alerts">
          <ul className="ledger-rows">
            {data.alerts.map((n) => (
              <li key={n.id} className="py-2.5 text-sm">
                <span className="font-medium">{n.title}</span>
                <span className="mt-0.5 block max-w-[72ch] text-[var(--ink-soft)]">{n.body}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!attendanceOn && (
        <Section title="Attendance is switched off">
          <p className="max-w-[68ch] text-sm text-[var(--ink-soft)]">
            Its screens are hidden and every record it holds is still there.
            Switch it back on from Modules and all of it returns.
          </p>
        </Section>
      )}
    </>
  );
}
