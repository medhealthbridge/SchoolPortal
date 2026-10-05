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
import {
  Avatar,
  EmptyState,
  LinkButton,
  Meta,
  PageHeader,
  Pill,
  Progress,
  Section,
  SplitBar,
  StatGrid,
  StatTile,
  StatusBadge,
  Table,
  CountLegend,
  type Counts,
} from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";

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
    timetableSize: Number(
      (
        await tx
          .select({ n: count() })
          .from(timetableSlots)
          .where(eq(timetableSlots.schoolId, school.id))
      )[0]?.n ?? 0,
    ),
    enrolled: Number(
      (
        await tx.select({ n: count() }).from(students).where(eq(students.schoolId, school.id))
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

  const counts: Counts = {
    present: data.summary?.present ?? 0,
    absent: data.summary?.absent ?? 0,
    late: data.summary?.late ?? 0,
    excused: data.summary?.excused ?? 0,
  };
  const marked = counts.present + counts.absent + counts.late + counts.excused;
  const needsSetup =
    perms.has("sections.manage") && attendanceOn && data.timetableSize === 0;
  const noClassesToday = (data.summary?.slotsExpected ?? 0) === 0;
  const pct = (n: number) => (marked === 0 ? "—" : `${((n / marked) * 100).toFixed(1)}% of marks`);

  const longDate = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <PageHeader
        title="Today"
        meta={
          <Meta
            items={[
              longDate,
              data.enrolled > 0 ? `${data.enrolled.toLocaleString("en-PH")} students enrolled` : null,
            ]}
          />
        }
        actions={
          data.summary && marked > 0 ? (
            <LinkButton href="/attendance/report" variant="secondary">
              Open the report
            </LinkButton>
          ) : null
        }
      />

      {needsSetup && (
        <Section
          title="Nothing is on the timetable yet"
          subtitle="Attendance opens the right class by itself once the timetable is in. It is the last step before teachers can start."
        >
          <LinkButton href="/setup">Finish setting up</LinkButton>
        </Section>
      )}

      {data.summary && !needsSetup && (
        <>
          <StatGrid>
            <StatTile label="Present" value={counts.present} caption={pct(counts.present)} />
            <StatTile label="Absent" value={counts.absent} caption={pct(counts.absent)} />
            <StatTile label="Late" value={counts.late} caption={pct(counts.late)} />
            <StatTile label="Excused" value={counts.excused} caption={pct(counts.excused)} />
            <StatTile
              label="Classes in"
              value={`${data.summary.slotsSubmitted}/${data.summary.slotsExpected}`}
              caption={
                noClassesToday
                  ? "Nothing scheduled today"
                  : `${data.summary.slotsExpected - data.summary.slotsSubmitted} still to submit`
              }
              pill={
                data.missing.length > 0 ? (
                  <Pill tone="warn">{data.missing.length} classes</Pill>
                ) : marked > 0 ? (
                  <Pill tone="ok">All in</Pill>
                ) : null
              }
            />
          </StatGrid>

          <Section
            title="The day so far"
            subtitle={
              noClassesToday
                ? "Nothing is scheduled today, so there is nothing to take."
                : marked === 0
                  ? "No class has submitted yet."
                  : `${marked} marks recorded across the school.`
            }
          >
            {marked > 0 ? (
              <div className="flex flex-col gap-4">
                <SplitBar counts={counts} />
                <CountLegend counts={counts} />
              </div>
            ) : noClassesToday ? (
              <EmptyState title="A quiet day">
                The next school day picks up where this one left off.{" "}
                <Link href="/attendance/report" className="font-medium underline underline-offset-2">
                  Look at the month so far
                </Link>
                .
              </EmptyState>
            ) : (
              <Progress
                done={data.summary.slotsSubmitted}
                total={data.summary.slotsExpected}
                label="classes have submitted"
              />
            )}
          </Section>
        </>
      )}

      {data.missing.length > 0 && (
        <Section
          title="Classes that have not submitted"
          subtitle={`Period for ${longDate.split(",")[0]} is under way.`}
          flush
        >
          <Table head={["Section", "Class", "Teacher", "Time"]} minWidth={560}>
            {data.missing.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="whitespace-nowrap text-left font-medium">
                  {s.sectionLevel} {s.sectionName}
                </th>
                <td className="text-muted">{s.subjectName}</td>
                <td>
                  <span className="flex items-center gap-2">
                    <Avatar name={s.teacherName} />
                    <span className="truncate">{s.teacherName}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap">{prettyTime(s.startsAt)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {data.mySlots.length > 0 && (
        <Section title="Your classes today" subtitle="Each one opens on its own seat plan.">
          <ul className="-mx-1">
            {data.mySlots.map((s, i) => (
              <li key={s.id} className={i > 0 ? "border-t border-line" : ""}>
                <Link
                  href={`/attendance/${s.id}`}
                  className="flex min-h-[60px] items-center justify-between gap-4 px-1 py-2.5 no-underline hover:bg-subtle"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{s.subjectName}</span>
                    <Meta items={[s.sectionLabel, s.roomName].filter(Boolean) as string[]} />
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-medium">{prettyTime(s.startsAt)}</span>
                    <ArrowRightIcon className="text-muted" />
                  </span>
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
          flush={recent.length > 0}
        >
          {recent.length === 0 ? (
            <EmptyState title="Nothing recorded yet this school year">
              Marks appear here as soon as a teacher submits a class.
            </EmptyState>
          ) : (
            <Table head={["Date", "Mark"]} minWidth={320}>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>{prettyDate(r.onDate)}</td>
                  <td>
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
          <ul className="-mx-1">
            {data.alerts.map((n, i) => (
              <li key={n.id} className={`px-1 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}>
                <span className="font-medium">{n.title}</span>
                <span className="mt-0.5 block max-w-[72ch] text-muted">{n.body}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!attendanceOn && (
        <Section title="Attendance is switched off">
          <EmptyState title="Its screens are hidden and every record it holds is still there">
            Switch it back on from Modules and all of it returns.
          </EmptyState>
        </Section>
      )}
    </>
  );
}
