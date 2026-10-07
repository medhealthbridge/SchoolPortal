import type { ReactNode } from "react";
import { byDay, dayName, type ScheduleEntry } from "@/lib/schedule";
import { prettyTime } from "@/lib/format";
import { EmptyState, Meta } from "./ui";

/**
 * A week of classes, one block per school day. The same shape for a teacher's
 * load, a section's timetable and a child's day; `show` decides whether the
 * second line names the section, the teacher, or both.
 */
export function WeekView({
  entries,
  show,
  empty,
  actions,
}: {
  entries: ScheduleEntry[];
  show: "section" | "teacher" | "both";
  empty?: ReactNode;
  actions?: (entry: ScheduleEntry) => ReactNode;
}) {
  if (entries.length === 0) {
    return <EmptyState title="No classes yet">{empty}</EmptyState>;
  }
  return (
    <div className="grid gap-5">
      {byDay(entries).map(([day, list]) => (
        <div key={day}>
          <h3 className="mb-1 text-sm font-semibold text-muted">{dayName(day)}</h3>
          <ul className="-mx-1">
            {list.map((e, i) => (
              <li
                key={e.id}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <span className="flex min-w-0 items-baseline gap-4">
                  <span className="w-[7.5rem] shrink-0 whitespace-nowrap font-medium tabular-nums">
                    {prettyTime(e.startsAt)}–{prettyTime(e.endsAt)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{e.subjectName}</span>
                    <Meta
                      items={[
                        show !== "section" ? e.teacherName : null,
                        show !== "teacher" ? e.sectionLabel : null,
                        e.roomName,
                      ]}
                    />
                  </span>
                </span>
                {actions && <span className="flex shrink-0 gap-2">{actions(e)}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
