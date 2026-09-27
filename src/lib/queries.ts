import "server-only";
import { getServiceSupabase } from "./supabase";

export type ContentSource = {
  id: string;
  name: string;
  kind: string;
  url: string | null;
};

export type DraftRow = {
  id: string;
  body: string;
  status:
    | "draft"
    | "approved"
    | "scheduled"
    | "publishing"
    | "posted"
    | "failed"
    | "skipped";
  scheduled_at: string | null;
  contains_url: boolean;
  content_source_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  content_source?: { name: string } | null;
  published_post?: { x_post_id: string; permalink: string | null; posted_at: string } | null;
};

export type VoiceSampleRow = {
  id: string;
  text: string;
  post_url: string | null;
  posted_at: string | null;
  impressions: number | null;
  engagements: number | null;
  likes: number | null;
  reposts: number | null;
  content_source_id: string | null;
  notes: string | null;
  is_active: boolean;
  content_source?: { name: string } | null;
};

export async function listContentSources(): Promise<ContentSource[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("content_sources")
    .select("id, name, kind, url")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentSource[];
}

const DRAFT_SELECT = `
  id, body, status, scheduled_at, contains_url, content_source_id,
  idempotency_key, created_at, updated_at,
  content_source:content_sources ( name ),
  published_post:published_posts ( x_post_id, permalink, posted_at )
`;

export async function listDraftsByStatus(
  statuses: DraftRow["status"][],
  limit = 40,
): Promise<DraftRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("x_post_drafts")
    .select(DRAFT_SELECT)
    .in("status", statuses)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DraftRow[];
}

export async function listRecentPosted(limit = 20): Promise<DraftRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("x_post_drafts")
    .select(DRAFT_SELECT)
    .eq("status", "posted")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DraftRow[];
}

export async function listRecentFailed(limit = 10): Promise<DraftRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("x_post_drafts")
    .select(DRAFT_SELECT)
    .in("status", ["failed", "skipped"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DraftRow[];
}

export async function getDraft(id: string): Promise<DraftRow | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("x_post_drafts")
    .select(DRAFT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as DraftRow | null;
}

export async function listVoiceSamples(): Promise<VoiceSampleRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("voice_samples")
    .select(
      "id, text, post_url, posted_at, impressions, engagements, likes, reposts, content_source_id, notes, is_active, content_source:content_sources ( name )",
    )
    .order("engagements", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as VoiceSampleRow[];
}

export async function getTodaySpendUsd(): Promise<number> {
  const supabase = getServiceSupabase();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("budget_ledger")
    .select("estimated_cost_usd")
    .gte("occurred_at", startOfDay.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.estimated_cost_usd), 0);
}
