import { NextResponse } from "next/server";
import { AccessError } from "./guard";

/** 1 = Monday … 7 = Sunday, matching `timetable_slots.weekday`. */
export function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

/** Turns the guard's AccessError into the status it names; logs the rest. */
export function errorResponse(err: unknown) {
  if (err instanceof AccessError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
