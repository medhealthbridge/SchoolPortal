"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Callout,
  EmptyState,
  Meta,
  PageHeader,
  Pill,
  Section,
} from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
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

  const now = new Date().toTimeString().slice(0, 8);
  const currentIndex = slots?.findIndex((s) => now >= s.startsAt && now <= s.endsAt) ?? -1;
  const nextIndex =
    currentIndex === -1 ? (slots?.findIndex((s) => s.startsAt > now) ?? -1) : -1;

  return (
    <>
      <PageHeader
        title="Attendance"
        meta={
          <Meta
            items={[
              WEEKDAYS[weekday] || "Today",
              slots ? `${slots.length} ${slots.length === 1 ? "class" : "classes"}` : null,
            ]}
          />
        }
      />

      {offline && (
        <Callout tone="offline" title="You are offline">
          These classes came from this morning&apos;s download. Everything you mark is held on
          this device until the signal returns.
        </Callout>
      )}
      {pendingCount > 0 && (
        <Callout tone="warn" title={`${pendingCount} ${pendingCount === 1 ? "mark" : "marks"} waiting to go up`}>
          They upload by themselves the moment you are back online.
        </Callout>
      )}

      <Section title="Your classes" subtitle="Each one opens on its own seat plan.">
        {slots === null ? (
          <p className="text-muted">Opening your timetable.</p>
        ) : slots.length === 0 ? (
          <EmptyState title="Nothing on your timetable today">
            The school admin builds the timetable in Setup, and your classes appear here the
            same day.
          </EmptyState>
        ) : (
          <ul className="-mx-1">
            {slots.map((s, i) => (
              <li key={s.id} className={i > 0 ? "border-t border-line" : ""}>
                <Link
                  href={`/attendance/${s.id}?date=${date}`}
                  className="flex min-h-[60px] items-center justify-between gap-3 px-1 py-2.5 no-underline hover:bg-subtle"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.subjectName}</span>
                      {i === currentIndex && <Pill tone="solid">Now</Pill>}
                      {i === nextIndex && <Pill>Next</Pill>}
                    </span>
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
        )}
      </Section>
    </>
  );
}
