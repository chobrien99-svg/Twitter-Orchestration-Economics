"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase";
import { postContainsUrl } from "@/lib/x-client";
import { fetchArticle, type FetchedArticle } from "@/lib/article-fetcher";
import { generateDrafts, type DraftVariant } from "@/lib/draft-generator";

export type GenerateResult =
  | {
      ok: true;
      sourceItemId: string;
      article: {
        title: string;
        url: string;
        siteName: string | null;
        excerpt: string | null;
      };
      drafts: Array<{
        id: string;
        kind: DraftVariant["kind"];
        text: string;
        reasoning: string;
        overLimit: boolean;
      }>;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        model: string;
      };
    }
  | { ok: false; error: string };

const SOURCE_KEY_TO_NAME: Record<FetchedArticle["contentSourceKey"], string> = {
  "decoding-discontinuity": "Decoding Discontinuity",
  "orchestration-economics": "Orchestration Economics",
  other: "Manual composition",
};

const SOURCE_NAME_TO_KEY: Record<string, FetchedArticle["contentSourceKey"]> = {
  "Decoding Discontinuity": "decoding-discontinuity",
  "Orchestration Economics": "orchestration-economics",
  "Manual composition": "other",
};

async function resolveContentSourceIdByKey(
  key: FetchedArticle["contentSourceKey"],
): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("content_sources")
    .select("id")
    .eq("name", SOURCE_KEY_TO_NAME[key])
    .maybeSingle();
  if (error) throw new Error(`Look up content_source: ${error.message}`);
  return data?.id ?? null;
}

/**
 * Rebuild a FetchedArticle from a source_items row so regenerate can skip
 * the network fetch + Readability parse.
 */
async function loadArticleFromSourceItem(
  sourceItemId: string,
): Promise<{ article: FetchedArticle; contentSourceId: string | null } | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("source_items")
    .select(
      "title, url, body, published_at, raw, source_id, content_source:content_sources(name)",
    )
    .eq("id", sourceItemId)
    .maybeSingle();
  if (error) throw new Error(`Load source_item: ${error.message}`);
  if (!data) return null;

  const raw = (data.raw ?? {}) as Record<string, unknown>;
  const sourceName = (data.content_source as { name?: string } | null)?.name ?? "";
  const contentSourceKey: FetchedArticle["contentSourceKey"] =
    SOURCE_NAME_TO_KEY[sourceName] ?? "other";

  const article: FetchedArticle = {
    url: data.url ?? "",
    title: data.title ?? "",
    byline: typeof raw.byline === "string" ? raw.byline : null,
    siteName: typeof raw.siteName === "string" ? raw.siteName : null,
    excerpt: typeof raw.excerpt === "string" ? raw.excerpt : null,
    textContent: data.body ?? "",
    publishedTime: data.published_at,
    contentSourceKey,
  };

  return { article, contentSourceId: data.source_id ?? null };
}

/**
 * Shared: call Claude, insert one draft per variant, return the result payload.
 * All variants land as status='draft' — never auto-approved.
 */
async function generateAndPersistDrafts(
  article: FetchedArticle,
  sourceItemId: string,
  contentSourceId: string | null,
): Promise<GenerateResult> {
  let generation;
  try {
    generation = await generateDrafts(article);
  } catch (err) {
    return {
      ok: false,
      error: `Generation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const supabase = getServiceSupabase();
  const inserted: Array<{
    id: string;
    kind: DraftVariant["kind"];
    text: string;
    reasoning: string;
    overLimit: boolean;
  }> = [];

  for (const v of generation.variants) {
    const overLimit = v.text.length > 280;
    const { data, error } = await supabase
      .from("x_post_drafts")
      .insert({
        body: v.text,
        contains_url: postContainsUrl(v.text),
        status: "draft",
        scheduled_at: null,
        content_source_id: contentSourceId,
        source_item_id: sourceItemId,
        idempotency_key: randomUUID(),
        position: 1,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Insert draft: ${error.message}` };
    inserted.push({
      id: data.id,
      kind: v.kind,
      text: v.text,
      reasoning: v.reasoning,
      overLimit,
    });
  }

  revalidatePath("/");
  revalidatePath("/generate");

  return {
    ok: true,
    sourceItemId,
    article: {
      title: article.title,
      url: article.url,
      siteName: article.siteName,
      excerpt: article.excerpt,
    },
    drafts: inserted,
    usage: {
      inputTokens: generation.inputTokens,
      outputTokens: generation.outputTokens,
      cacheReadTokens: generation.cacheReadTokens,
      cacheWriteTokens: generation.cacheWriteTokens,
      model: generation.model,
    },
  };
}

/**
 * Initial generation from a URL — fetches the page, extracts the article,
 * upserts source_items, then generates drafts.
 */
export async function generateFromUrlAction(formData: FormData): Promise<GenerateResult> {
  const rawUrl = String(formData.get("url") ?? "").trim();
  if (!rawUrl) return { ok: false, error: "URL is required." };

  let article: FetchedArticle;
  try {
    article = await fetchArticle(rawUrl);
  } catch (err) {
    return {
      ok: false,
      error: `Fetch/parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const contentSourceId = await resolveContentSourceIdByKey(article.contentSourceKey);
  if (!contentSourceId) {
    return { ok: false, error: "No content_source found — has migration 0002 run?" };
  }

  const supabase = getServiceSupabase();
  let sourceItemId: string;
  const { data: existing } = await supabase
    .from("source_items")
    .select("id")
    .eq("source_id", contentSourceId)
    .eq("external_id", article.url)
    .maybeSingle();

  if (existing) {
    sourceItemId = existing.id;
    await supabase
      .from("source_items")
      .update({
        title: article.title,
        url: article.url,
        body: article.textContent,
        published_at: article.publishedTime,
        raw: { byline: article.byline, excerpt: article.excerpt, siteName: article.siteName },
      })
      .eq("id", sourceItemId);
  } else {
    const { data: insertedRow, error: insertErr } = await supabase
      .from("source_items")
      .insert({
        source_id: contentSourceId,
        external_id: article.url,
        title: article.title,
        url: article.url,
        body: article.textContent,
        published_at: article.publishedTime,
        raw: { byline: article.byline, excerpt: article.excerpt, siteName: article.siteName },
      })
      .select("id")
      .single();
    if (insertErr) return { ok: false, error: `Insert source_item: ${insertErr.message}` };
    sourceItemId = insertedRow.id;
  }

  return generateAndPersistDrafts(article, sourceItemId, contentSourceId);
}

/**
 * Regenerate from a source_items row we already fetched. Skips the network
 * fetch + Readability parse; only re-calls Claude. Keeps prior drafts
 * intact (still visible in the queue) so nothing is lost.
 */
export async function regenerateFromSourceItemAction(
  sourceItemId: string,
): Promise<GenerateResult> {
  if (!sourceItemId) return { ok: false, error: "Missing sourceItemId." };
  const loaded = await loadArticleFromSourceItem(sourceItemId);
  if (!loaded) return { ok: false, error: "Source item not found." };
  return generateAndPersistDrafts(loaded.article, sourceItemId, loaded.contentSourceId);
}
