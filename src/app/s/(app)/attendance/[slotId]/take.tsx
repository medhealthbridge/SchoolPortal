"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  Callout,
  CountLegend,
  EmptyState,
  Field,
  Input,
  Section,
  SeatChip,
  SegmentedStatus,
  STATUS_META,
  STATUS_ORDER,
  type AttendanceStatus,
  type Counts,
} from "@/components/ui";
import { ChevronLeftIcon } from "@/components/icons";
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
  const [query, setQuery] = useState("");
  const [lastChange, setLastChange] = useState<{
    statuses: Record<string, AttendanceStatus>;
    label: string;
  } | null>(null);

  const cacheKey = `class:${slotId}:${date}`;

  useEffect(() => {
    // Everyone starts present; the teacher marks only the empty seats. What is
    // on the server comes next, and marks still held on this phone come last —
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

  const counts: Counts = useMemo(() => {
    const out: Counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const s of Object.values(statuses)) out[s] += 1;
    return out;
  }, [statuses]);

  const setStatus = useCallback(
    (studentId: string, next: AttendanceStatus, who: string) => {
      setStatuses((prev) => {
        setLastChange({ statuses: prev, label: `${who} marked ${STATUS_META[next].label}.` });
        return { ...prev, [studentId]: next };
      });
      setSaved(null);
    },
    [],
  );

  const cycle = useCallback(
    (studentId: string, who: string) =>
      setStatus(studentId, NEXT_STATUS[statuses[studentId] ?? "present"], who),
    [statuses, setStatus],
  );

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
    setLastChange(null);
    setSaved(
      result.left > 0
        ? `Held on this device. ${result.left} marks go up when you are back online.`
        : `Submitted. ${counts.present} present, ${counts.absent} absent, ${counts.late} late.`,
    );
    setBusy(false);
  };

  if (!data) {
    return <Section title="Opening the class list">{null}</Section>;
  }

  const grid = buildGrid(data.roster);
  const needle = query.trim().toLowerCase();
  const listRows = data.roster.filter(
    (r) => !needle || r.name.toLowerCase().includes(needle) || r.studentNumber.toLowerCase().includes(needle),
  );
  const showSeats = grid !== null && view === "seats";

  return (
    <>
      <div className="flex items-start gap-1">
        <Link
          href="/attendance"
          aria-label="Back to your classes"
          className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink no-underline hover:bg-subtle"
        >
          <ChevronLeftIcon size={20} />
        </Link>
        <div className="min-w-0 flex-1 pt-1.5">
          <h1 className="truncate text-base font-semibold leading-tight tracking-[-0.01em] sm:text-2xl sm:tracking-[-0.02em]">
            {data.slot.subjectName}
          </h1>
          <p className="text-[13px] text-muted sm:text-sm">
            {[
              data.slot.sectionLabel,
              data.slot.roomName,
              `${prettyTime(data.slot.startsAt)}–${prettyTime(data.slot.endsAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {grid && (
        <div
          className="grid gap-0 rounded-panel bg-subtle p-[3px]"
          style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
        >
          {(["seats", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`h-10 rounded-control text-sm font-medium ${
                view === v ? "bg-surface text-ink shadow-card" : "text-muted-strong"
              }`}
            >
              {v === "seats" ? "Seats" : "List"}
            </button>
          ))}
        </div>
      )}

      {offline && (
        <Callout tone="offline" title="You are offline">
          {pending > 0
            ? `${pending} ${pending === 1 ? "mark is" : "marks are"} saved on this device. They go up when you are back online.`
            : "Every mark is saved on this device and goes up by itself."}
        </Callout>
      )}
      {saved && <Callout tone="ok">{saved}</Callout>}

      <div
        aria-live="polite"
        className="grid rounded-card border border-line bg-surface shadow-card"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        {STATUS_ORDER.map((k, i) => (
          <div
            key={k}
            className={`flex flex-col gap-1 px-3.5 py-2.5 ${i > 0 ? "border-l border-line" : ""}`}
          >
            <span className="text-xs text-muted">{STATUS_META[k].label}</span>
            <span
              className="text-xl font-semibold leading-none"
              style={{ color: k === "present" ? undefined : `var(--${k}-fg)` }}
            >
              {counts[k]}
            </span>
          </div>
        ))}
      </div>

      {showSeats ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-center text-xs text-muted">Back of room</p>
          {/* The grid keeps the room's shape; on a phone it scrolls sideways
              rather than squeezing out the names. */}
          <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${grid!.cols}, minmax(94px, 1fr))` }}
            >
              {grid!.cells.map((cell, i) =>
                cell ? (
                  <SeatChip
                    key={cell.studentId}
                    name={cell.name.split(",")[0]}
                    secondary={
                      (statuses[cell.studentId] ?? "present") === "present"
                        ? initials(cell.name)
                        : undefined
                    }
                    title={`${cell.name}, ${cell.studentNumber}`}
                    status={statuses[cell.studentId] ?? "present"}
                    onTap={() => cycle(cell.studentId, cell.name.split(",")[0])}
                  />
                ) : (
                  <div
                    key={`gap-${i}`}
                    aria-hidden
                    className="h-[46px] rounded-control border border-dashed border-line-strong"
                  />
                ),
              )}
            </div>
          </div>
          <p className="flex h-6 items-center justify-center rounded-[var(--r-pill)] border border-dashed border-line-strong text-xs text-muted">
            Whiteboard · front of room
          </p>
        </div>
      ) : (
        <>
          <Field label="Find a student" htmlFor="find">
            <Input
              id="find"
              type="search"
              autoComplete="off"
              placeholder="Type a surname or a student ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <Section flush title={`${listRows.length} of ${data.roster.length} students`}>
            {listRows.length === 0 ? (
              <div className="border-t border-line px-5 sm:px-6">
                <EmptyState title="No student in this class matches that name">
                  Check the spelling, or clear the search to see all {data.roster.length}.
                </EmptyState>
              </div>
            ) : (
              <ul className="border-t border-line">
                {listRows.map((r, i) => (
                  <li
                    key={r.studentId}
                    className={`flex min-h-[60px] items-center gap-3 px-5 py-2 sm:px-6 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium leading-tight">
                        {r.name.split(",")[0]}
                      </span>
                      <span className="block truncate text-[13px] leading-tight text-muted">
                        {r.name.split(",")[1]?.trim() ?? r.studentNumber}
                      </span>
                    </span>
                    <SegmentedStatus
                      label={`Mark for ${r.name}`}
                      value={statuses[r.studentId] ?? "present"}
                      onChange={(next) => setStatus(r.studentId, next, r.name.split(",")[0])}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {/* The submit bar sits above the phone tab bar and in flow on desktop. */}
      <div className="sticky bottom-[68px] z-10 -mx-[var(--gutter)] flex flex-col gap-2 border-t border-line bg-surface px-[var(--gutter)] py-3 lg:bottom-0 lg:mx-0 lg:rounded-card lg:border lg:shadow-card">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
          <span className="text-muted">
            {lastChange?.label ??
              (showSeats
                ? "Everyone starts present. Tap a seat to change it."
                : "Everyone starts present. Pick a mark to change it.")}
          </span>
          <div className="flex gap-2">
            {lastChange && (
              <Button
                variant="secondary"
                onClick={() => {
                  setStatuses(lastChange.statuses);
                  setLastChange(null);
                }}
              >
                Undo
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setLastChange({ statuses, label: "Everyone marked present." });
                setStatuses(
                  Object.fromEntries(data.roster.map((r) => [r.studentId, "present" as const])),
                );
              }}
            >
              Mark all present
            </Button>
          </div>
        </div>
        <div className="hidden sm:block">
          <CountLegend counts={counts} />
        </div>
        <Button size="lg" onClick={submit} disabled={busy}>
          {busy ? "Saving" : `Submit attendance · ${data.roster.length} students`}
        </Button>
      </div>
    </>
  );
}

function initials(name: string) {
  const first = name.split(",")[1]?.trim() ?? "";
  return (
    first
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w[0]}.`)
      .join("") || undefined
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
