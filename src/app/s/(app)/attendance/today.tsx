"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner, Meta, Section } from "@/components/ui";
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
        const cached = await localCache.get<{ slots: Slot[]; weekday: number }>(`today:${today}`);
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
    <>
      {offline && (
        <Banner tone="warn">
          No signal. These classes came from this morning&apos;s download, and
          everything you mark is held here until the signal returns.
        </Banner>
      )}
      {pendingCount > 0 && (
        <Banner tone="warn">
          {pendingCount} {pendingCount === 1 ? "mark is" : "marks are"} waiting to go up.
        </Banner>
      )}

      <Section
        title={WEEKDAYS[weekday] || "Today"}
        subtitle="Open a class to take it. Each one remembers its seat plan."
      >
        {slots === null ? (
          <p className="text-sm text-[var(--ink-soft)]">Opening your timetable.</p>
        ) : slots.length === 0 ? (
          <p className="max-w-[60ch] text-sm text-[var(--ink-soft)]">
            Nothing on your timetable today. The school admin builds the
            timetable in Setup, and your classes appear here the same day.
          </p>
        ) : (
          <ul className="ledger-rows">
            {slots.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/attendance/${s.id}?date=${date}`}
                  className="flex items-baseline justify-between gap-4 py-3 hover:text-[var(--brand)]"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{s.subjectName}</span>
                    <Meta items={[s.sectionLabel, s.roomName].filter(Boolean) as string[]} />
                  </span>
                  <span className="shrink-0 text-sm font-semibold">
                    {prettyTime(s.startsAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
