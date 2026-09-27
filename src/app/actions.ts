"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase";
import { postContainsUrl } from "@/lib/x-client";
import { POST_HARD_LIMIT } from "@/lib/post-limits";

type Ok = { ok: true; id?: string };
type Fail = { ok: false; error: string };
export type ActionResult = Ok | Fail;

function trimmed(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeScheduledAt(raw: string): string {
  // Empty → publish now.
  if (!raw) return new Date().toISOString();
  // <input type="datetime-local"> gives "YYYY-MM-DDTHH:MM" in the user's
  // local tz. Passing to new Date() treats it as local time and converts
  // to UTC on toISOString(), which is what we want to store.
  const d = new Date(raw);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

// ---------------- drafts ----------------

export async function createDraftAction(formData: FormData): Promise<void> {
  const text = trimmed(formData.get("text"));
  const scheduledAt = normalizeScheduledAt(trimmed(formData.get("scheduled_at")));
  const contentSourceId = trimmed(formData.get("content_source_id")) || null;
  const status = trimmed(formData.get("status")) as "draft" | "approved";

  if (!text) throw new Error("Text is required.");
  if (text.length > POST_HARD_LIMIT) {
    throw new Error(`Text is ${text.length} chars; max ${POST_HARD_LIMIT}.`);
  }
  if (status !== "draft" && status !== "approved") {
    throw new Error(`Invalid status: ${status}`);
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("x_post_drafts")
    .insert({
      body: text,
      contains_url: postContainsUrl(text),
      status,
      scheduled_at: scheduledAt,
      content_source_id: contentSourceId,
      idempotency_key: randomUUID(),
      position: 1,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/compose");
  redirect(`/drafts/${data.id}`);
}

export async function updateDraftAction(formData: FormData): Promise<void> {
  const id = trimmed(formData.get("id"));
  const text = trimmed(formData.get("text"));
  const scheduledAt = normalizeScheduledAt(trimmed(formData.get("scheduled_at")));
  const contentSourceId = trimmed(formData.get("content_source_id")) || null;
  const status = trimmed(formData.get("status")) as
    | "draft"
    | "approved"
    | "scheduled"
    | "publishing"
    | "posted"
    | "failed"
    | "skipped";

  if (!id) throw new Error("Missing id.");
  if (!text) throw new Error("Text is required.");
  if (text.length > POST_HARD_LIMIT) {
    throw new Error(`Text is ${text.length} chars; max ${POST_HARD_LIMIT}.`);
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("x_post_drafts")
    .update({
      body: text,
      contains_url: postContainsUrl(text),
      scheduled_at: scheduledAt,
      content_source_id: contentSourceId,
      status,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath(`/drafts/${id}`);
}

export async function approveDraftAction(formData: FormData): Promise<void> {
  const id = trimmed(formData.get("id"));
  if (!id) throw new Error("Missing id.");
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("x_post_drafts")
    .update({ status: "approved" })
    .eq("id", id)
    .in("status", ["draft", "failed", "skipped"]);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/drafts/${id}`);
}

export async function unapproveDraftAction(formData: FormData): Promise<void> {
  const id = trimmed(formData.get("id"));
  if (!id) throw new Error("Missing id.");
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("x_post_drafts")
    .update({ status: "draft" })
    .eq("id", id)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/drafts/${id}`);
}

export async function deleteDraftAction(formData: FormData): Promise<void> {
  const id = trimmed(formData.get("id"));
  if (!id) throw new Error("Missing id.");
  const supabase = getServiceSupabase();
  // Only delete drafts that haven't hit the wire. Posted drafts are
  // history — don't let the UI drop them silently.
  const { error } = await supabase
    .from("x_post_drafts")
    .delete()
    .eq("id", id)
    .in("status", ["draft", "approved", "failed", "skipped"]);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  redirect("/");
}

// ---------------- voice samples ----------------

export async function createVoiceSampleAction(formData: FormData): Promise<void> {
  const text = trimmed(formData.get("text"));
  const contentSourceId = trimmed(formData.get("content_source_id")) || null;
  const postUrl = trimmed(formData.get("post_url")) || null;
  const notes = trimmed(formData.get("notes")) || null;
  if (!text) throw new Error("Text is required.");

  const supabase = getServiceSupabase();
  const { error } = await supabase.from("voice_samples").insert({
    text,
    content_source_id: contentSourceId,
    post_url: postUrl,
    notes,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/voice-samples");
}

export async function toggleVoiceSampleAction(formData: FormData): Promise<void> {
  const id = trimmed(formData.get("id"));
  const nextActive = trimmed(formData.get("next_active")) === "true";
  if (!id) throw new Error("Missing id.");
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("voice_samples")
    .update({ is_active: nextActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/voice-samples");
}

export async function deleteVoiceSampleAction(formData: FormData): Promise<void> {
  const id = trimmed(formData.get("id"));
  if (!id) throw new Error("Missing id.");
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("voice_samples").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/voice-samples");
}

// ---------------- draft → voice sample promotion ----------------

/**
 * Promote a draft's current text to a voice_sample. If the draft has been
 * posted, we also carry over the permalink so the sample is anchored to a
 * real post. Duplicate texts are allowed — user decides what qualifies.
 */
export async function promoteDraftToVoiceSampleAction(formData: FormData): Promise<void> {
  const id = trimmed(formData.get("id"));
  if (!id) throw new Error("Missing id.");

  const supabase = getServiceSupabase();
  const { data: draft, error: draftErr } = await supabase
    .from("x_post_drafts")
    .select(
      "body, content_source_id, status, published_post:published_posts(x_post_id, permalink, posted_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (draftErr) throw new Error(draftErr.message);
  if (!draft) throw new Error("Draft not found.");
  if (!draft.body?.trim()) throw new Error("Draft is empty.");

  const published = (draft.published_post as
    | { x_post_id: string; permalink: string | null; posted_at: string | null }
    | { x_post_id: string; permalink: string | null; posted_at: string | null }[]
    | null) ?? null;
  const publishedRow = Array.isArray(published) ? published[0] ?? null : published;

  const { error } = await supabase.from("voice_samples").insert({
    text: draft.body,
    content_source_id: draft.content_source_id,
    x_post_id: publishedRow?.x_post_id ?? null,
    post_url: publishedRow?.permalink ?? null,
    posted_at: publishedRow?.posted_at ?? null,
    notes:
      draft.status === "posted"
        ? "Promoted from posted draft"
        : `Promoted from ${draft.status} draft`,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/voice-samples");
  revalidatePath(`/drafts/${id}`);
}
