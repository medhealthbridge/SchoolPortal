import { NextResponse } from "next/server";
import { authorizeCron, runScheduledJobs } from "@/lib/scheduled";

export const dynamic = "force-dynamic";

/**
 * The one endpoint a scheduler calls. Any cron that can make an HTTP request
 * works — Vercel Cron, a GitHub Action, or crontab and curl:
 *
 *   curl -X POST https://yourapp.com/api/cron/run \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Monthly on the 1st is the schedule the billing wants; nightly is better for
 * the event queue, and running both is harmless because every job in here is
 * safe to repeat.
 *
 * Middleware does not rewrite /api/cron, so this answers on any host.
 */
export async function POST(req: Request) {
  if (!authorizeCron(req.headers.get("authorization"))) {
    // The same answer whether the secret is wrong or simply not configured:
    // a caller learns nothing about which.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? undefined;
  const report = await runScheduledJobs(period);

  console.log("[cron]", JSON.stringify(report));
  return NextResponse.json(report, { status: report.errors.length ? 500 : 200 });
}

/** Vercel Cron sends GET. Same job, same guard. */
export const GET = POST;
