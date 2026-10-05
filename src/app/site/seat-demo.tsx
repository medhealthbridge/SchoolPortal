"use client";

import { useMemo, useState } from "react";
import {
  Button,
  CountLegend,
  SeatChip,
  type AttendanceStatus,
  type Counts,
} from "@/components/ui";

/**
 * The hero is the product. A visitor taps the seat plan, cuts the signal, and
 * watches the marks queue instead of disappear — which is the one thing a
 * principal is deciding about when they look at this page.
 */
const COLS = 6;
const ROWS = 5;

const NAMES = [
  "Abad", "Agustin", "Aquino", "Bautista", "Belmonte", "Cabrera",
  "Castillo", "Cruz", "Dela Cruz", "Del Rosario", "Dizon", "Domingo",
  "Enriquez", "Escobar", "Fernandez", "Flores", "Garcia", "Gonzales",
  "Guevarra", "Hernandez", "Ilagan", "Javier", "Lacson", "Lim",
  "Macaraeg", "Magsaysay", "Manalo", "Mendoza", "Navarro", "Ocampo",
];

const NEXT: Record<AttendanceStatus, AttendanceStatus> = {
  present: "absent",
  absent: "late",
  late: "excused",
  excused: "present",
};

const SEEDED: Record<number, AttendanceStatus> = { 2: "absent", 9: "absent", 14: "late", 22: "absent" };

export default function SeatDemo() {
  const [statuses, setStatuses] = useState<AttendanceStatus[]>(() =>
    Array.from({ length: ROWS * COLS }, (_, i) => SEEDED[i] ?? "present"),
  );
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [justSynced, setJustSynced] = useState(false);

  const counts: Counts = useMemo(() => {
    const out: Counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const s of statuses) out[s] += 1;
    return out;
  }, [statuses]);

  const tap = (i: number) => {
    setStatuses((prev) => prev.map((s, j) => (i === j ? NEXT[s] : s)));
    if (!online) setQueued((n) => n + 1);
    setJustSynced(false);
  };

  const toggleSignal = () => {
    const goingOnline = !online;
    setOnline(goingOnline);
    if (goingOnline && queued > 0) {
      setJustSynced(true);
      setQueued(0);
      window.setTimeout(() => setJustSynced(false), 2600);
    }
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold">Science 8 · Rizal</p>
          <p className="text-[13px] text-muted">Period 2 · 8:30–9:30 · Room 204</p>
        </div>
        <Button variant="secondary" size="sm" onClick={toggleSignal} aria-pressed={!online}>
          {online ? "Cut the signal" : "Bring the signal back"}
        </Button>
      </div>

      <div
        aria-hidden
        className="h-[3px] w-full transition-colors"
        style={{ background: online ? "var(--line)" : "var(--late-solid)" }}
      />

      <div className="px-4 pb-4 pt-4">
        <p className="mb-2.5 text-center text-xs text-muted">Back of room</p>
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${COLS}, minmax(88px, 1fr))` }}
          >
            {statuses.map((status, i) => (
              <SeatChip
                key={i}
                name={NAMES[i % NAMES.length]}
                status={status}
                onTap={() => tap(i)}
              />
            ))}
          </div>
        </div>
        <p className="mt-2.5 flex h-6 items-center justify-center rounded-[var(--r-pill)] border border-dashed border-line-strong text-xs text-muted">
          Whiteboard · front of room
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-3">
          <CountLegend counts={counts} />
          <p aria-live="polite" className="text-sm">
            {!online && queued > 0 && (
              <span style={{ color: "var(--warn)" }}>
                {queued} {queued === 1 ? "mark" : "marks"} held on this device
              </span>
            )}
            {!online && queued === 0 && <span className="text-muted">No signal. Keep marking.</span>}
            {online && justSynced && (
              <span style={{ color: "var(--ok)" }}>Everything uploaded.</span>
            )}
            {online && !justSynced && <span className="text-muted">Saved as you tap.</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
