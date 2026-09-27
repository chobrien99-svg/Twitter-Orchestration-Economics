"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase";
import { postContainsUrl } from "@/lib/x-client";

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
  if (text.length > 280) throw new Error(`Text is ${text.length} chars; max 280.`);
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
  if (text.length > 280) throw new Error(`Text is ${text.length} chars; max 280.`);

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
