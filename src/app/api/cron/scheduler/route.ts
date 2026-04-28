import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runPublisher } from "@/lib/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel cron entry point for the publisher worker. Runs every minute.
 *
 * When CRON_SECRET is set, requires `Authorization: Bearer <CRON_SECRET>`
 * (Vercel attaches this automatically to scheduled invocations). When unset,
 * the route is open — fine for local development, not for production.
 */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const summary = await runPublisher();
    return NextResponse.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduler] runPublisher threw:", err);
    return NextResponse.json(
      { ok: false, error: "publisher_failed", detail: message },
      { status: 500 },
    );
  }
}
