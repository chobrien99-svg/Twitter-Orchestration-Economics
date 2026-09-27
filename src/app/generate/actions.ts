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

async function resolveContentSourceId(
  key: FetchedArticle["contentSourceKey"],
): Promise<string | null> {
  const supabase = getServiceSupabase();
  const nameByKey: Record<FetchedArticle["contentSourceKey"], string> = {
    "decoding-discontinuity": "Decoding Discontinuity",
    "orchestration-economics": "Orchestration Economics",
    other: "Manual composition",
  };
  const { data, error } = await supabase
    .from("content_sources")
    .select("id")
    .eq("name", nameByKey[key])
    .maybeSingle();
  if (error) throw new Error(`Look up content_source: ${error.message}`);
  return data?.id ?? null;
}

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

  const supabase = getServiceSupabase();
  const contentSourceId = await resolveContentSourceId(article.contentSourceKey);

  // Upsert source_items keyed on (source_id, external_id=url).
  let sourceItemId: string;
  if (contentSourceId) {
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
          raw: {
            byline: article.byline,
            excerpt: article.excerpt,
            siteName: article.siteName,
          },
        })
        .eq("id", sourceItemId);
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("source_items")
        .insert({
          source_id: contentSourceId,
          external_id: article.url,
          title: article.title,
          url: article.url,
          body: article.textContent,
          published_at: article.publishedTime,
          raw: {
            byline: article.byline,
            excerpt: article.excerpt,
            siteName: article.siteName,
          },
        })
        .select("id")
        .single();
      if (insertErr) return { ok: false, error: `Insert source_item: ${insertErr.message}` };
      sourceItemId = inserted.id;
    }
  } else {
    return { ok: false, error: "No content_source found — has migration 0002 run?" };
  }

  // Generate variants via Claude.
  let generation;
  try {
    generation = await generateDrafts(article);
  } catch (err) {
    return {
      ok: false,
      error: `Generation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Persist each variant as a draft (status='draft' — needs human approval).
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
