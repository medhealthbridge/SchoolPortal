"use client";

import { useMemo, useState } from "react";
import { STATUS_META, STATUS_ORDER, SeatChip, type AttendanceStatus } from "@/components/ui";

/**
 * The hero is the product. A visitor taps the seat plan, cuts the signal, and
 * watches the taps queue instead of disappear — which is the one thing a
 * principal is deciding about when they look at this page.
 */
const ROWS = 5;
const COLS = 6;

const NAMES = [
  "Alonzo", "Bautista", "Cruz", "Dizon", "Espino", "Fajardo", "Gonzales", "Hernandez",
  "Ignacio", "Javier", "Katigbak", "Lim", "Mercado", "Navarro", "Ocampo", "Prieto",
  "Quiambao", "Reyes", "Santos", "Tolentino", "Uy", "Villanueva", "Wong", "Yap",
  "Agbayani", "Bernardo", "Castro", "Delos Reyes", "Enriquez", "Flores", "Garcia", "Hizon",
  "Isidro", "Jimenez", "Lazaro", "Manalo", "Nuqui", "Obispo", "Pascual", "Ramos",
];

const NEXT: Record<AttendanceStatus, AttendanceStatus> = {
  present: "absent",
  absent: "late",
  late: "excused",
  excused: "present",
};

const SEEDED_ABSENT = new Set([2, 9, 22]);
const SEEDED_LATE = new Set([14]);

export default function SeatDemo() {
  const [statuses, setStatuses] = useState<AttendanceStatus[]>(() =>
    Array.from({ length: ROWS * COLS }, (_, i) =>
      SEEDED_ABSENT.has(i) ? "absent" : SEEDED_LATE.has(i) ? "late" : "present",
    ),
  );
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [justSynced, setJustSynced] = useState(false);

  const counts = useMemo(() => {
    const out = { present: 0, absent: 0, late: 0, excused: 0 } as Record<AttendanceStatus, number>;
    for (const s of statuses) out[s] += 1;
    return out;
  }, [statuses]);

  const tap = (i: number) => {
    setStatuses((prev) => prev.map((s, j) => (i === j ? NEXT[s] : s)));
    if (!online) setQueued((n) => n + 1);
  };

  const toggleSignal = () => {
    const goingOnline = !online;
    setOnline(goingOnline);
    if (goingOnline && queued > 0) {
      setJustSynced(true);
      setQueued(0);
      window.setTimeout(() => setJustSynced(false), 2200);
    }
  };

  return (
    <div className="ledger-page min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--rule)] px-4 py-3">
        <div>
          <p className="w-wide text-[0.9375rem] font-semibold">Mathematics 7</p>
          <p className="w-narrow text-[0.8125rem] text-[var(--ink-soft)]">
            Grade 7 Sampaguita, Room 201, 7:30
          </p>
        </div>
        <button
          type="button"
          onClick={toggleSignal}
          aria-pressed={!online}
          className="rounded-[2px] border border-[var(--ink-soft)] px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--ink)] hover:bg-[var(--paper-sunken)]"
        >
          {online ? "Cut the signal" : "Signal is back"}
        </button>
      </div>

      <div
        aria-hidden
        className="h-[3px] w-full"
        style={{
          background: online ? "var(--rule-soft)" : "var(--accent)",
          transition: "background 240ms",
        }}
      />

      <div className="px-4 pb-4 pt-4">
        <p className="w-narrow mb-3 text-center text-[0.75rem] text-[var(--ink-faint)]">
          front of the room
        </p>
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${COLS}, minmax(86px, 1fr))` }}
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

        <div className="ledger-hair mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-3">
          <dl className="flex flex-wrap gap-x-5 gap-y-1">
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
                <dd className="font-semibold">{counts[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm" aria-live="polite">
            {!online && queued > 0 && (
              <span className="text-[var(--color-late)]">
                {queued} {queued === 1 ? "tap" : "taps"} held on this phone
              </span>
            )}
            {!online && queued === 0 && (
              <span className="text-[var(--ink-soft)]">No signal. Keep tapping.</span>
            )}
            {online && justSynced && (
              <span className="text-[var(--color-present)]">Everything uploaded.</span>
            )}
            {online && !justSynced && (
              <span className="text-[var(--ink-faint)]">Saved as you tap.</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
