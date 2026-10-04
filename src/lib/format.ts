export function todayIso(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function monthKey(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

export function prettyDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

export function prettyTime(hhmmss: string) {
  const [h, m] = hhmmss.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

export const WEEKDAYS = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
