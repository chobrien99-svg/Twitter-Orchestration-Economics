import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel cron entry point for the publisher worker.
 *
 * Vercel automatically attaches an `Authorization: Bearer <CRON_SECRET>`
 * header when CRON_SECRET is set in project env. We verify it here so that
 * external callers cannot trigger publishing.
 *
 * Current state: stub. Once the publisher logic is wired, this will:
 *   1. Check today's spend against DAILY_BUDGET_USD.
 *   2. Select x_post_drafts where status='approved' and scheduled_at <= now().
 *   3. For each, call the X API, log to publish_attempts and budget_ledger,
 *      and update status to 'posted' or 'failed'.
 */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.json({
    ok: true,
    stub: true,
    dryRun: env.dryRun(),
    dailyBudgetUsd: env.dailyBudgetUsd(),
    note: "Scheduler stub. Publisher logic wires in after the test-publish round-trip is verified.",
    timestamp: new Date().toISOString(),
  });
}
