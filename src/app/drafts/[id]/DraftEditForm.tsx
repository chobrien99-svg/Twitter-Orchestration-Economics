"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  updateDraftAction,
  approveDraftAction,
  unapproveDraftAction,
  deleteDraftAction,
  promoteDraftToVoiceSampleAction,
} from "../../actions";
import type { ContentSource, DraftRow } from "@/lib/queries";
import { classifyLength, POST_HARD_LIMIT, POST_SOFT_LIMIT } from "@/lib/post-limits";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DraftEditForm({
  draft,
  sources,
}: {
  draft: DraftRow;
  sources: ContentSource[];
}) {
  const [text, setText] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const [promotedAt, setPromotedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const state = classifyLength(text.length);
  const overHard = state === "over";
  const long = state === "long";

  const readOnly =
    draft.status === "posted" || draft.status === "publishing";

  const defaultScheduled = useMemo(() => toLocalInput(draft.scheduled_at), [draft.scheduled_at]);

  const run = (fn: (fd: FormData) => Promise<void>) => (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn(fd);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("NEXT_REDIRECT")) throw err;
        setError(msg);
      }
    });
  };

  const runPromote = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await promoteDraftToVoiceSampleAction(fd);
        setPromotedAt(Date.now());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const justPromoted = promotedAt !== null && Date.now() - promotedAt < 60_000;

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <form action={run(updateDraftAction)}>
        <input type="hidden" name="id" value={draft.id} />
        <div className="form-row">
          <label htmlFor="text">Post text</label>
          <textarea
            id="text"
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={readOnly}
            required
          />
          <div className={`char-count ${state === "over" ? "over" : state === "long" ? "long" : ""}`}>
            {text.length} / {POST_SOFT_LIMIT}
            {long && ` — long post (X will collapse under "Show more"; needs X Premium)`}
            {overHard && ` — over ${POST_HARD_LIMIT.toLocaleString()} char hard cap`}
          </div>
        </div>

        <div className="row">
          <div className="form-row">
            <label htmlFor="content_source_id">Source</label>
            <select
              id="content_source_id"
              name="content_source_id"
              defaultValue={draft.content_source_id ?? ""}
              disabled={readOnly}
            >
              <option value="">— unspecified —</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label htmlFor="scheduled_at">Publish at (your local time)</label>
            <input
              id="scheduled_at"
              name="scheduled_at"
              type="datetime-local"
              defaultValue={defaultScheduled}
              disabled={readOnly}
            />
          </div>

          <div className="form-row">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              defaultValue={draft.status}
              disabled={readOnly}
            >
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              {draft.status === "failed" && <option value="failed">Failed</option>}
              {draft.status === "skipped" && <option value="skipped">Skipped</option>}
              {draft.status === "scheduled" && <option value="scheduled">Scheduled</option>}
              {draft.status === "posted" && <option value="posted">Posted</option>}
              {draft.status === "publishing" && (
                <option value="publishing">Publishing</option>
              )}
            </select>
          </div>
        </div>

        {!readOnly && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" type="submit" disabled={pending || overHard}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </form>

      {!readOnly && (
        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          {draft.status !== "approved" ? (
            <form action={run(approveDraftAction)}>
              <input type="hidden" name="id" value={draft.id} />
              <button className="btn" type="submit" disabled={pending}>
                Approve for publish
              </button>
            </form>
          ) : (
            <form action={run(unapproveDraftAction)}>
              <input type="hidden" name="id" value={draft.id} />
              <button className="btn" type="submit" disabled={pending}>
                Move back to draft
              </button>
            </form>
          )}
          <form action={run(deleteDraftAction)}>
            <input type="hidden" name="id" value={draft.id} />
            <button
              className="btn danger"
              type="submit"
              disabled={pending}
              onClick={(e) => {
                if (!confirm("Delete this draft? Cannot be undone.")) {
                  e.preventDefault();
                }
              }}
            >
              Delete
            </button>
          </form>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: readOnly ? 20 : 12,
          flexWrap: "wrap",
        }}
      >
        <form action={runPromote}>
          <input type="hidden" name="id" value={draft.id} />
          <button className="btn" type="submit" disabled={pending || !text.trim()}>
            Save as voice sample
          </button>
        </form>
        {justPromoted && (
          <>
            <span
              className="badge posted"
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              Saved
            </span>
            <Link href="/voice-samples" className="meta-line">
              view in Voice ↗
            </Link>
          </>
        )}
        <span className="meta-line">
          {draft.status === "posted"
            ? "Anchors this post as a voice reference — informs future article-to-drafts generations."
            : "Promotes the current text into the voice_samples calibration set."}
        </span>
      </div>

      <div style={{ marginTop: 24 }} className="meta-line">
        Created {new Date(draft.created_at).toLocaleString()} · updated{" "}
        {new Date(draft.updated_at).toLocaleString()}
      </div>
    </>
  );
}
