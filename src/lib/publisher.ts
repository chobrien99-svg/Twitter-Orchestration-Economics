import { SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import { getServiceSupabase } from "./supabase";
import { getXClient, postOperationName } from "./x-client";
import { getCostMap, getTodaysSpendUsd, CostMap } from "./budget";

const MAX_ATTEMPTS = 3;
const BATCH_LIMIT = 20;

export type PublisherSummary = {
  ok: true;
  dryRun: boolean;
  spentUsdBefore: number;
  spentUsdAfter: number;
  dailyBudgetUsd: number;
  posted: number;
  failedFatal: number;
  failedRetryable: number;
  budgetSkipped: number;
  contestedSkipped: number;
  dueDrafts: number;
};

type DraftRow = {
  id: string;
  body: string;
  contains_url: boolean;
  scheduled_at: string | null;
  thread_id: string | null;
  position: number;
  reply_to_post_id: string | null;
  idempotency_key: string | null;
};

/**
 * One publisher tick. Idempotent across overlapping cron invocations because
 * each draft is claimed via a conditional UPDATE (approved -> publishing).
 *
 *   1. Query today's spend, derive remaining budget headroom.
 *   2. Fetch up to BATCH_LIMIT drafts where status='approved' and due.
 *   3. For each draft:
 *        a. Look up unit cost (create_post / create_post_with_url).
 *        b. Skip if cost > remaining headroom (draft stays approved; will
 *           retry next tick — likely the next day after budget resets).
 *        c. Atomic claim: UPDATE ... WHERE status='approved' RETURNING.
 *           A second worker that loses the race gets no row and skips.
 *        d. Insert a publish_attempts row, call X (or simulate if DRY_RUN),
 *           update attempt + ledger, transition draft to posted/failed.
 */
export async function runPublisher(): Promise<PublisherSummary> {
  const supabase = getServiceSupabase();
  const dryRun = env.dryRun();
  const dailyBudget = env.dailyBudgetUsd();

  const spentBefore = await getTodaysSpendUsd(supabase);
  const costMap = await getCostMap(supabase);

  const summary: PublisherSummary = {
    ok: true,
    dryRun,
    spentUsdBefore: spentBefore,
    spentUsdAfter: spentBefore,
    dailyBudgetUsd: dailyBudget,
    posted: 0,
    failedFatal: 0,
    failedRetryable: 0,
    budgetSkipped: 0,
    contestedSkipped: 0,
    dueDrafts: 0,
  };

  let remaining = dailyBudget - spentBefore;
  if (remaining <= 0) return summary;

  const nowIso = new Date().toISOString();
  const { data: drafts, error: draftsErr } = await supabase
    .from("x_post_drafts")
    .select("id, body, contains_url, scheduled_at, thread_id, position, reply_to_post_id, idempotency_key")
    .eq("status", "approved")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (draftsErr) throw new Error(`fetch due drafts failed: ${draftsErr.message}`);

  summary.dueDrafts = drafts?.length ?? 0;

  for (const draft of (drafts ?? []) as DraftRow[]) {
    const operation = postOperationName(draft.body);
    const cost = costMap.get(operation) ?? 0.02;

    if (cost > remaining) {
      summary.budgetSkipped += 1;
      continue;
    }

    const claimed = await claimDraft(supabase, draft.id);
    if (!claimed) {
      summary.contestedSkipped += 1;
      continue;
    }

    const result = await processDraft(supabase, draft, operation, cost, dryRun);
    remaining -= cost;
    summary.spentUsdAfter += cost;

    if (result === "posted") summary.posted += 1;
    else if (result === "fatal") summary.failedFatal += 1;
    else summary.failedRetryable += 1;
  }

  return summary;
}

async function claimDraft(supabase: SupabaseClient, draftId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("x_post_drafts")
    .update({ status: "publishing" })
    .eq("id", draftId)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`claim draft ${draftId} failed: ${error.message}`);
  return !!data;
}

async function nextAttemptNo(supabase: SupabaseClient, draftId: string): Promise<number> {
  const { count, error } = await supabase
    .from("publish_attempts")
    .select("*", { count: "exact", head: true })
    .eq("draft_id", draftId);
  if (error) throw new Error(`count attempts for ${draftId} failed: ${error.message}`);
  return (count ?? 0) + 1;
}

type ProcessOutcome = "posted" | "retryable" | "fatal";

async function processDraft(
  supabase: SupabaseClient,
  draft: DraftRow,
  operation: string,
  estimatedCost: number,
  dryRun: boolean,
): Promise<ProcessOutcome> {
  const attemptNo = await nextAttemptNo(supabase, draft.id);

  // Insert a placeholder attempt row we update at the end. This gives us an
  // attempt id we can stamp onto the budget_ledger entry.
  const { data: attemptRow, error: attemptInsertErr } = await supabase
    .from("publish_attempts")
    .insert({
      draft_id: draft.id,
      attempt_no: attemptNo,
      status: dryRun ? "dry_run" : "retryable_error",
      request_payload: { text: draft.body, reply_to: draft.reply_to_post_id },
    })
    .select("id")
    .single();
  if (attemptInsertErr) throw new Error(`insert attempt failed: ${attemptInsertErr.message}`);
  const attemptId = attemptRow.id as string;

  if (dryRun) {
    const fakeXId = `dryrun-${draft.id}`;
    await supabase.from("publish_attempts").update({
      status: "dry_run",
      finished_at: new Date().toISOString(),
      response_payload: { simulated: true },
    }).eq("id", attemptId);

    await supabase.from("budget_ledger").insert({
      api_operation: operation,
      draft_id: draft.id,
      attempt_id: attemptId,
      estimated_cost_usd: 0,
      notes: "DRY_RUN",
    });

    await supabase.from("published_posts").insert({
      draft_id: draft.id,
      x_post_id: fakeXId,
      permalink: `dryrun://${fakeXId}`,
      response_payload: { simulated: true },
    });

    await supabase.from("x_post_drafts").update({ status: "posted" }).eq("id", draft.id);
    return "posted";
  }

  // Real publish
  try {
    const client = getXClient();
    const tweetOpts = draft.reply_to_post_id
      ? { reply: { in_reply_to_tweet_id: draft.reply_to_post_id } }
      : undefined;
    const result = tweetOpts
      ? await client.v2.tweet(draft.body, tweetOpts)
      : await client.v2.tweet(draft.body);

    const xPostId = result.data.id;

    await supabase.from("published_posts").insert({
      draft_id: draft.id,
      x_post_id: xPostId,
      permalink: `https://x.com/i/web/status/${xPostId}`,
      response_payload: result.data,
    });

    await supabase.from("publish_attempts").update({
      status: "success",
      http_status: 200,
      response_payload: result.data,
      finished_at: new Date().toISOString(),
    }).eq("id", attemptId);

    await supabase.from("budget_ledger").insert({
      api_operation: operation,
      draft_id: draft.id,
      attempt_id: attemptId,
      estimated_cost_usd: estimatedCost,
    });

    await supabase.from("x_post_drafts").update({ status: "posted" }).eq("id", draft.id);
    return "posted";
  } catch (err: unknown) {
    const e = (err ?? {}) as Record<string, unknown>;
    const httpStatus = typeof e.code === "number" ? (e.code as number) : 0;
    const isRetryable =
      httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600) || httpStatus === 0;
    const errorStatus: "retryable_error" | "fatal_error" = isRetryable ? "retryable_error" : "fatal_error";

    await supabase.from("publish_attempts").update({
      status: errorStatus,
      http_status: httpStatus || null,
      error_code: String(httpStatus || "unknown"),
      error_message: typeof e.message === "string" ? (e.message as string) : String(err),
      response_payload: (e.data as object | undefined) ?? null,
      finished_at: new Date().toISOString(),
    }).eq("id", attemptId);

    // X bills failed writes too — log conservatively.
    await supabase.from("budget_ledger").insert({
      api_operation: operation,
      draft_id: draft.id,
      attempt_id: attemptId,
      estimated_cost_usd: estimatedCost,
      notes: `failed: ${errorStatus} (${httpStatus})`,
    });

    const giveUp = !isRetryable || attemptNo >= MAX_ATTEMPTS;
    const nextStatus = giveUp ? "failed" : "approved";
    await supabase.from("x_post_drafts").update({ status: nextStatus }).eq("id", draft.id);
    return giveUp ? "fatal" : "retryable";
  }
}
