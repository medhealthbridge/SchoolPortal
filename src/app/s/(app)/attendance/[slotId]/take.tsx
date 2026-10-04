"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, STATUS_META } from "@/components/ui";
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

/** Tapping a seat walks through the statuses, so one finger does everything. */
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
    const load = async () => {
      try {
        const res = await fetch(`/api/attendance/class/${slotId}?date=${date}`);
        if (!res.ok) throw new Error("offline");
        const fresh: ClassData = await res.json();
        setData(fresh);
        await localCache.set(cacheKey, fresh);
        setOffline(false);
        await seed(fresh);
        // Anything left from a class taken with no signal goes up now.
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

    // Everyone starts present; the teacher taps only the empty seats. What is
    // already on the server comes next, and taps still waiting on this phone
    // come last — they are the newest thing this teacher did.
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
        ? `Saved on this phone. ${result.left} waiting to upload.`
        : `Submitted. ${counts.present} present, ${counts.absent} absent, ${counts.late} late.`,
    );
    setBusy(false);
  };

  if (!data) {
    return <Card>Loading the class list…</Card>;
  }

  const grid = buildGrid(data.roster);

  return (
    <div className="grid gap-5">
      {offline && (
        <Banner tone="warn">
          No signal. Every tap is saved on this phone and uploads by itself.
        </Banner>
      )}
      {saved && <Banner>{saved}</Banner>}
      {pending > 0 && !saved && (
        <Banner tone="warn">{pending} taps from this class are waiting to upload.</Banner>
      )}

      <Card
        title={`${data.slot.subjectName} · ${data.slot.sectionLabel}`}
        subtitle={`${prettyTime(data.slot.startsAt)}–${prettyTime(data.slot.endsAt)}${
          data.slot.roomName ? ` · ${data.slot.roomName}` : ""
        } · ${date}`}
        actions={
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setView((v) => (v === "seats" ? "list" : "seats"))}
              className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
            >
              {view === "seats" ? "List" : "Seat plan"}
            </button>
            <Link href="/attendance" className="underline">
              All classes
            </Link>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-3 text-xs">
          {(Object.keys(STATUS_META) as AttendanceStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-flex h-5 w-5 items-center justify-center rounded font-mono text-[11px] font-bold text-white"
                style={{ backgroundColor: STATUS_META[s].color }}
              >
                {STATUS_META[s].letter}
              </span>
              {STATUS_META[s].label}: <strong>{counts[s]}</strong>
            </span>
          ))}
        </div>

        {grid && view === "seats" ? (
          <>
            <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-black/45 dark:text-white/45">
              front of the room
            </p>
            {/* The grid keeps the room's shape; on a phone it scrolls sideways
                rather than squeezing the names out. */}
            <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(92px, 1fr))` }}
              >
                {grid.cells.map((cell, i) =>
                  cell ? (
                    <SeatButton
                      key={cell.studentId}
                      entry={cell}
                      status={statuses[cell.studentId] ?? "present"}
                      onTap={() => cycle(cell.studentId)}
                    />
                  ) : (
                    <div
                      key={`gap-${i}`}
                      className="rounded-lg border border-dashed border-black/10 dark:border-white/10"
                    />
                  ),
                )}
              </div>
            </div>
          </>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.roster.map((entry) => (
              <li key={entry.studentId}>
                <SeatButton
                  entry={entry}
                  status={statuses[entry.studentId] ?? "present"}
                  onTap={() => cycle(entry.studentId)}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Submit"}
          </Button>
          <span className="text-xs text-black/55 dark:text-white/55">
            Tap a seat to change it: present → absent → late → excused.
          </span>
        </div>
      </Card>
    </div>
  );
}

function SeatButton({
  entry,
  status,
  onTap,
}: {
  entry: RosterEntry;
  status: AttendanceStatus;
  onTap: () => void;
}) {
  const meta = STATUS_META[status];
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${entry.name}: ${meta.label}`}
      title={`${entry.name} · ${entry.studentNumber}`}
      className="flex w-full items-center gap-2 rounded-lg border border-black/10 bg-white p-1.5 text-left transition active:scale-[0.97] dark:border-white/15 dark:bg-white/5"
    >
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded font-mono text-sm font-bold text-white"
        style={{ backgroundColor: meta.color }}
      >
        {meta.letter}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[11px] font-medium">
          {entry.name.split(",")[0]}
        </span>
        <span className="block truncate text-[10px] text-black/55 dark:text-white/55">
          {entry.name.split(",")[1]?.trim() ?? entry.studentNumber}
        </span>
      </span>
    </button>
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
