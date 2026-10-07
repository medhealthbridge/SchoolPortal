import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Attempt limiting for anything a stranger can hammer: sign-in, student-ID
 * signup, parent signup. The counter lives in Postgres, not in a Map, so it
 * survives a restart and holds across every instance behind a load balancer.
 *
 * One statement does the whole thing. `on conflict` either rolls the window
 * over — because the old one has expired — or adds one to the count, and the
 * row it returns is the decision. Two requests arriving together serialise on
 * the row rather than both reading a stale count.
 */
export type Budget = { max: number; windowMs: number };

export const LOGIN: Budget = { max: 10, windowMs: 10 * 60_000 };
export const SIGNUP: Budget = { max: 8, windowMs: 10 * 60_000 };

export type Attempt = { allowed: boolean; retryInSeconds: number };

export async function attempt(key: string, budget: Budget = LOGIN): Promise<Attempt> {
  // An ISO string with an explicit cast: drizzle's raw `execute` hands the
  // parameter straight to the driver, which does not serialise a Date.
  const reset = new Date(Date.now() + budget.windowMs).toISOString();
  const [row] = (await db.execute(sql`
    insert into auth_throttle (key, count, reset_at)
    values (${key}, 1, ${reset}::timestamptz)
    on conflict (key) do update set
      count = case when auth_throttle.reset_at < now() then 1 else auth_throttle.count + 1 end,
      reset_at = case when auth_throttle.reset_at < now() then ${reset}::timestamptz else auth_throttle.reset_at end
    returning count, reset_at
  `)) as unknown as { count: number; reset_at: string | Date }[];

  const resetAt = new Date(row.reset_at);
  return {
    allowed: Number(row.count) <= budget.max,
    retryInSeconds: Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
  };
}

/** Called after a sign-in succeeds, so a correct password clears the budget. */
export async function clearAttempts(key: string) {
  await db.execute(sql`delete from auth_throttle where key = ${key}`);
}

/** "Too many attempts. Try again in 7 minutes." — never a bare number of seconds. */
export function retryMessage(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1
    ? "Too many attempts. Try again in a minute."
    : `Too many attempts. Try again in ${minutes} minutes.`;
}

/** Housekeeping for the scheduled runner: expired windows are dead weight. */
export async function purgeExpiredAttempts() {
  await db.execute(sql`delete from auth_throttle where reset_at < now() - interval '1 day'`);
}
