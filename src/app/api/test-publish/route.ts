import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getXClient, postOperationName } from "@/lib/x-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  text: z.string().min(1).max(280),
});

/**
 * Hello-world endpoint. Sends a single tweet using the configured X
 * credentials. When DRY_RUN=true, the request is simulated and no API call
 * is made (no money spent).
 *
 * curl -X POST $URL/api/test-publish \
 *   -H 'content-type: application/json' \
 *   -d '{"text":"hello from the pipeline"}'
 */
export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", detail: String(err) },
      { status: 400 },
    );
  }

  const { text } = parsed;
  const operation = postOperationName(text);

  if (env.dryRun()) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      operation,
      text,
      note: "DRY_RUN=true — no API call was made.",
    });
  }

  try {
    const client = getXClient();
    const result = await client.v2.tweet(text);
    return NextResponse.json({
      ok: true,
      dryRun: false,
      operation,
      xPostId: result.data.id,
      permalink: `https://x.com/i/web/status/${result.data.id}`,
      raw: result.data,
    });
  } catch (err: unknown) {
    const detail: Record<string, unknown> = {};
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      detail.message = e.message;
      detail.code = e.code;
      detail.data = e.data;
      detail.errors = e.errors;
    } else {
      detail.message = String(err);
    }
    console.error("[test-publish] X API error:", detail);
    return NextResponse.json(
      { ok: false, error: "publish_failed", detail },
      { status: 502 },
    );
  }
}
