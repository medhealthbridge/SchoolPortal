"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banner, Button, Meta, Section, SeatChip, STATUS_META, STATUS_ORDER } from "@/components/ui";
import type { AttendanceStatus } from "@/components/ui";
import { drainQueue, localCache, queue, uuid } from "@/lib/offline";
import { prettyTime } from "@/lib/format";

type RosterEntry = {
  studentId: string;
  studentNumber: string;
  name: string;
  row: number | null;
  col: number | null;
};

type ClassData = {
  slot: {
    id: string;
    subjectName: string;
    sectionLabel: string;
    roomName: string | null;
    startsAt: string;
    endsAt: string;
  };
  roster: RosterEntry[];
  marked: { studentId: string; status: AttendanceStatus }[];
  date: string;
};

/** One finger does everything: a seat walks through the four marks. */
const NEXT_STATUS: Record<AttendanceStatus, AttendanceStatus> = {
  present: "absent",
  absent: "late",
  late: "excused",
  excused: "present",
};

export default function TakeAttendance({ slotId, date }: { slotId: string; date: string }) {
  const [data, setData] = useState<ClassData | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [offline, setOffline] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"seats" | "list">("seats");

  const cacheKey = `class:${slotId}:${date}`;

  useEffect(() => {
    // Everyone starts present; the teacher marks only the empty seats. What is
    // on the server comes next, and taps still held on this phone come last —
    // they are the newest thing this teacher did.
    const seed = async (d: ClassData) => {
      const next: Record<string, AttendanceStatus> = {};
      for (const s of d.roster) next[s.studentId] = "present";
      for (const m of d.marked) next[m.studentId] = m.status;

      const queued = (await queue.all())
        .filter((q) => q.slotId === slotId && q.onDate === date)
        .sort((a, b) => a.markedAt.localeCompare(b.markedAt));
      for (const q of queued) next[q.studentId] = q.status;

      setStatuses(next);
    };

    const load = async () => {
      try {
        const res = await fetch(`/api/attendance/class/${slotId}?date=${date}`);
        if (!res.ok) throw new Error("offline");
        const fresh: ClassData = await res.json();
        setData(fresh);
        await localCache.set(cacheKey, fresh);
        setOffline(false);
        await seed(fresh);
        await drainQueue();
      } catch {
        const cached = await localCache.get<ClassData>(cacheKey);
        if (cached) {
          setData(cached);
          await seed(cached);
        }
        setOffline(true);
      }
      setPending(await queue.countForSlot(slotId, date));
    };

    void load();
  }, [slotId, date, cacheKey]);

  const counts = useMemo(() => {
    const out = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const s of Object.values(statuses)) out[s] += 1;
    return out;
  }, [statuses]);

  const cycle = useCallback((studentId: string) => {
    setStatuses((prev) => ({ ...prev, [studentId]: NEXT_STATUS[prev[studentId] ?? "present"] }));
  }, []);

  const submit = async () => {
    if (!data) return;
    setBusy(true);
    const markedAt = new Date().toISOString();
    for (const entry of data.roster) {
      await queue.put({
        id: uuid(),
        studentId: entry.studentId,
        slotId,
        onDate: date,
        status: statuses[entry.studentId] ?? "present",
        markedAt,
      });
    }
    const result = await drainQueue();
    setPending(await queue.countForSlot(slotId, date));
    setSaved(
      result.left > 0
        ? `Held on this phone. ${result.left} marks go up when the signal returns.`
        : `Submitted. ${counts.present} present, ${counts.absent} absent, ${counts.late} late.`,
    );
    setBusy(false);
  };

  if (!data) {
    return <Section title="Opening the class list">{null}</Section>;
  }

  const grid = buildGrid(data.roster);

  return (
    <>
      {offline && (
        <Banner tone="warn">
          No signal. Every mark is saved on this phone and goes up by itself.
        </Banner>
      )}
      {saved && <Banner>{saved}</Banner>}
      {pending > 0 && !saved && (
        <Banner tone="warn">{pending} marks from this class are waiting to go up.</Banner>
      )}

      <Section
        title={data.slot.subjectName}
        subtitle={
          <Meta
            items={[
              data.slot.sectionLabel,
              data.slot.roomName,
              `${prettyTime(data.slot.startsAt)} to ${prettyTime(data.slot.endsAt)}`,
              data.date,
            ].filter(Boolean) as string[]}
          />
        }
        actions={
          <div className="flex items-center gap-4 text-sm">
            {grid && (
              <button
                type="button"
                onClick={() => setView((v) => (v === "seats" ? "list" : "seats"))}
                className="rounded-[2px] border border-[var(--ink-soft)] px-2.5 py-1 text-[0.8125rem]"
              >
                {view === "seats" ? "Show as a list" : "Show the seat plan"}
              </button>
            )}
            <Link href="/attendance" className="underline underline-offset-2">
              All classes
            </Link>
          </div>
        }
      >
        <dl className="mb-5 flex flex-wrap gap-x-5 gap-y-1.5">
          {STATUS_ORDER.map((k) => (
            <div key={k} className="flex items-baseline gap-1.5 text-sm">
              <dt className="flex items-baseline gap-1.5 text-[var(--ink-soft)]">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 translate-y-[1px]"
                  style={{ backgroundColor: STATUS_META[k].color }}
                />
                {STATUS_META[k].label}
              </dt>
              <dd className="text-base font-semibold">{counts[k]}</dd>
            </div>
          ))}
        </dl>

        {grid && view === "seats" ? (
          <>
            <p className="w-narrow mb-2.5 text-center text-[0.75rem] text-[var(--ink-faint)]">
              front of the room
            </p>
            {/* The grid keeps the room's shape; on a phone it scrolls sideways
                rather than squeezing out the names. */}
            <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(94px, 1fr))` }}
              >
                {grid.cells.map((cell, i) =>
                  cell ? (
                    <SeatChip
                      key={cell.studentId}
                      name={cell.name.split(",")[0]}
                      secondary={cell.name.split(",")[1]?.trim()}
                      title={`${cell.name}, ${cell.studentNumber}`}
                      status={statuses[cell.studentId] ?? "present"}
                      onTap={() => cycle(cell.studentId)}
                    />
                  ) : (
                    <div key={`gap-${i}`} className="border border-dashed border-[var(--rule)]" />
                  ),
                )}
              </div>
            </div>
          </>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {data.roster.map((entry) => (
              <li key={entry.studentId}>
                <SeatChip
                  name={entry.name}
                  secondary={entry.studentNumber}
                  status={statuses[entry.studentId] ?? "present"}
                  onTap={() => cycle(entry.studentId)}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="ledger-hair mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 pt-4">
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving" : "Submit"}
          </Button>
          <p className="max-w-[48ch] text-sm text-[var(--ink-soft)]">
            Tap a seat to mark it absent. Tap again for late, again for excused.
          </p>
        </div>
      </Section>
    </>
  );
}

/** Lays the class out on the saved seat plan, when there is one. */
function buildGrid(roster: RosterEntry[]) {
  const seated = roster.filter((r) => r.row !== null && r.col !== null);
  if (seated.length === 0 || seated.length !== roster.length) return null;
  const rows = Math.max(...seated.map((r) => r.row!)) + 1;
  const cols = Math.max(...seated.map((r) => r.col!)) + 1;
  const cells: (RosterEntry | null)[] = Array.from({ length: rows * cols }, () => null);
  for (const entry of seated) cells[entry.row! * cols + entry.col!] = entry;
  return { rows, cols, cells };
}
