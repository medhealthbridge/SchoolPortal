import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  attendanceRecords,
  notifications,
  studentGuardians,
  students,
} from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { enabledModules } from "@/lib/tenant";
import { permissionsFor } from "@/lib/roles";
import {
  dailySummary,
  slotsForTeacher,
  unsubmittedSlots,
} from "@/modules/attendance/queries";
import { monthKey, prettyDate, prettyTime, todayIso } from "@/lib/format";
import { Card, StatusBadge, Table } from "@/components/ui";

export const metadata = { title: "Home" };

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

  return (
    <div className="grid gap-5">
      {data.summary && (
        <Card title="Today" subtitle={`${prettyDate(date)} · ${school.name}`}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {(
              [
                ["Present", data.summary.present],
                ["Absent", data.summary.absent],
                ["Late", data.summary.late],
                ["Excused", data.summary.excused],
                [
                  "Classes submitted",
                  `${data.summary.slotsSubmitted}/${data.summary.slotsExpected}`,
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-black/55 dark:text-white/55">
                  {label}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {data.missing.length > 0 && (
        <Card title="Classes that have not submitted" subtitle="As of right now">
          <Table head={["Time", "Class", "Teacher"]}>
            {data.missing.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pr-4 tabular-nums">{prettyTime(s.startsAt)}</td>
                <td className="py-2 pr-4">
                  {s.subjectName} · {s.sectionLevel} {s.sectionName}
                </td>
                <td className="py-2 pr-4">{s.teacherName}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {data.mySlots.length > 0 && (
        <Card title="Your classes today" subtitle="Opens the right class by itself.">
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {data.mySlots.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/attendance/${s.id}`}
                  className="flex items-center justify-between py-3 hover:opacity-80"
                >
                  <span>
                    <span className="block font-medium">{s.subjectName}</span>
                    <span className="block text-sm text-black/60 dark:text-white/60">
                      {s.sectionLabel}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums">{prettyTime(s.startsAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {watched.length > 0 && (
        <Card
          title={data.mine.length ? "Your attendance" : "Your children"}
          subtitle={watched.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}
        >
          {recent.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              Nothing recorded yet this school year.
            </p>
          ) : (
            <Table head={["Date", "Status"]}>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4">{prettyDate(r.onDate)}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {data.alerts.length > 0 && (
        <Card title="Alerts">
          <ul className="space-y-3 text-sm">
            {data.alerts.map((n) => (
              <li key={n.id}>
                <span className="font-medium">{n.title}</span>
                <span className="block text-black/65 dark:text-white/65">{n.body}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!attendanceOn && (
        <Card title="Attendance is switched off">
          <p className="text-sm">
            The screens are hidden and the data stays. Switch it back on from
            Modules and everything returns.
          </p>
        </Card>
      )}

      <p className="text-xs text-black/45 dark:text-white/45">
        Signed in as {session.name} · {session.roles.join(", ")} · reporting month{" "}
        {monthKey()}
      </p>
    </div>
  );
}
