"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner, Card } from "@/components/ui";
import { drainQueue, localCache, queue, registerServiceWorker } from "@/lib/offline";
import { prettyTime, WEEKDAYS } from "@/lib/format";

type Slot = {
  id: string;
  startsAt: string;
  endsAt: string;
  subjectName: string;
  sectionLabel: string;
  roomName: string | null;
};

export default function TodayClasses() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [weekday, setWeekday] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    registerServiceWorker();

    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);
      setDate(today);
      try {
        const res = await fetch(`/api/attendance/today?date=${today}`);
        if (!res.ok) throw new Error("offline");
        const data = await res.json();
        setSlots(data.slots);
        setWeekday(data.weekday);
        await localCache.set(`today:${today}`, data);
        setOffline(false);
      } catch {
        const cached = await localCache.get<{ slots: Slot[]; weekday: number }>(
          `today:${today}`,
        );
        setSlots(cached?.slots ?? []);
        setWeekday(cached?.weekday ?? 0);
        setOffline(true);
      }
      setPendingCount((await queue.all()).length);
    };

    void load();

    const onOnline = async () => {
      await drainQueue();
      setPendingCount((await queue.all()).length);
      void load();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <div className="grid gap-5">
      {offline && (
        <Banner tone="warn">
          No signal. These classes came from this morning&apos;s download, and
          everything you tap is saved here until the signal returns.
        </Banner>
      )}
      {pendingCount > 0 && (
        <Banner tone="warn">
          {pendingCount} {pendingCount === 1 ? "tap" : "taps"} waiting to upload.
        </Banner>
      )}

      <Card
        title={`Today — ${WEEKDAYS[weekday] || ""}`}
        subtitle="Tap a class to open its seat plan."
      >
        {slots === null ? (
          <p className="text-sm text-black/60">Loading…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No classes on the timetable today.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {slots.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/attendance/${s.id}?date=${date}`}
                  className="flex items-center justify-between gap-3 py-3 hover:opacity-80"
                >
                  <span>
                    <span className="block font-medium">{s.subjectName}</span>
                    <span className="block text-sm text-black/60 dark:text-white/60">
                      {s.sectionLabel}
                      {s.roomName ? ` · ${s.roomName}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-black/65 dark:text-white/65">
                    {prettyTime(s.startsAt)}–{prettyTime(s.endsAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
