import { timingSafeEqual } from "node:crypto";
import { withPlatform } from "@/db";
import { schools } from "@/db/schema";
import { issueInvoices, markPastDue } from "./invoicing";
import { processEvents } from "./events";
import { purgeExpiredAttempts } from "./throttle";
import { monthKey } from "./format";

export type JobReport = {
  ranAt: string;
  invoicesIssued: number;
  schoolsPastDue: number;
  eventsProcessed: number;
  schoolsSkipped: number;
  errors: string[];
};

/**
 * Everything the platform does on a timer, in one function, so there is one
 * thing to call and one report to read. It is safe to run at any hour and
 * safe to run twice: invoicing skips a school that already has the period's
 * invoice, and the event queue marks each event done inside the same
 * transaction that acts on it.
 */
export async function runScheduledJobs(period = monthKey()): Promise<JobReport> {
  const errors: string[] = [];
  const report: JobReport = {
    ranAt: new Date().toISOString(),
    invoicesIssued: 0,
    schoolsPastDue: 0,
    eventsProcessed: 0,
    schoolsSkipped: 0,
    errors,
  };

  try {
    report.invoicesIssued = (await issueInvoices(period)).length;
  } catch (err) {
    errors.push(`issueInvoices: ${String(err)}`);
  }

  try {
    report.schoolsPastDue = await markPastDue();
  } catch (err) {
    errors.push(`markPastDue: ${String(err)}`);
  }

  // Per school, so one school's bad row cannot stop every other school's
  // alerts. A suspended school reports itself paused and is counted as such.
  const all = await withPlatform((tx) => tx.select({ id: schools.id }).from(schools));
  for (const school of all) {
    try {
      const outcome = await processEvents(school.id);
      if ("paused" in outcome && outcome.paused) report.schoolsSkipped += 1;
      else report.eventsProcessed += outcome.processed;
    } catch (err) {
      errors.push(`processEvents(${school.id}): ${String(err)}`);
    }
  }

  try {
    await purgeExpiredAttempts();
  } catch (err) {
    errors.push(`purgeExpiredAttempts: ${String(err)}`);
  }

  return report;
}

/**
 * Compares in constant time, so the secret cannot be recovered a character at
 * a time from how long the comparison took.
 */
export function authorizeCron(header: string | null): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false;
  const given = (header ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
