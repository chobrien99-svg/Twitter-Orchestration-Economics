/**
 * Insert a row into x_post_drafts.
 *
 * Usage:
 *   npm run draft -- "tweet text"                       # approved, scheduled now
 *   npm run draft -- "tweet text" --in 5m              # +5 minutes
 *   npm run draft -- "tweet text" --in 2h              # +2 hours
 *   npm run draft -- "tweet text" --at 2026-04-29T10:00:00Z
 *   npm run draft -- "tweet text" --status draft       # don't auto-publish
 */
import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "../src/lib/supabase";
import { postContainsUrl } from "../src/lib/x-client";

type Args = {
  text: string;
  scheduledAt: Date;
  status: "approved" | "draft";
};

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      flags[a.slice(2)] = argv[++i] ?? "";
    } else {
      positional.push(a);
    }
  }

  const text = positional.join(" ").trim();
  if (!text) {
    console.error("Usage: npm run draft -- \"tweet text\" [--in 5m|2h|1d] [--at ISO] [--status draft|approved]");
    process.exit(1);
  }
  if (text.length > 280) {
    console.error(`Text is ${text.length} chars; max 280.`);
    process.exit(1);
  }

  let scheduledAt = new Date();
  if (flags.at) {
    scheduledAt = new Date(flags.at);
    if (isNaN(scheduledAt.getTime())) {
      console.error(`Invalid --at value: ${flags.at}`);
      process.exit(1);
    }
  } else if (flags.in) {
    const m = flags.in.match(/^(\d+)([smhd])$/);
    if (!m) {
      console.error(`Invalid --in value: ${flags.in} (expected like 30s, 5m, 2h, 1d)`);
      process.exit(1);
    }
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const ms = n * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as "s" | "m" | "h" | "d"];
    scheduledAt = new Date(Date.now() + ms);
  }

  const status = (flags.status as "approved" | "draft") ?? "approved";
  if (status !== "approved" && status !== "draft") {
    console.error(`Invalid --status: ${status} (expected 'approved' or 'draft')`);
    process.exit(1);
  }

  return { text, scheduledAt, status };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("x_post_drafts")
    .insert({
      body: args.text,
      contains_url: postContainsUrl(args.text),
      status: args.status,
      scheduled_at: args.scheduledAt.toISOString(),
      idempotency_key: randomUUID(),
      position: 1,
    })
    .select("id, body, status, scheduled_at, contains_url, idempotency_key")
    .single();

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log("Inserted draft:");
  console.log(JSON.stringify(data, null, 2));
  console.log(
    `\nScheduled for ${args.scheduledAt.toISOString()} ` +
      `(${Math.round((args.scheduledAt.getTime() - Date.now()) / 1000)}s from now).`,
  );
  if (args.status === "approved") {
    console.log("Status=approved → the next publisher tick will pick it up.");
  } else {
    console.log("Status=draft → it will NOT publish until you change status to 'approved'.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
