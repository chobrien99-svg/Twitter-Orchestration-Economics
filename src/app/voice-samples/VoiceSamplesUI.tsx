"use client";

import { useState, useTransition } from "react";
import {
  createVoiceSampleAction,
  toggleVoiceSampleAction,
  deleteVoiceSampleAction,
} from "../actions";
import type { ContentSource, VoiceSampleRow } from "@/lib/queries";

export function VoiceSamplesUI({
  samples,
  sources,
}: {
  samples: VoiceSampleRow[];
  sources: ContentSource[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");

  const active = samples.filter((s) => s.is_active);
  const inactive = samples.filter((s) => !s.is_active);

  const wrap = (fn: (fd: FormData) => Promise<void>) => (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn(fd);
        setText("");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    });
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <form action={wrap(createVoiceSampleAction)}>
          <div className="form-row">
            <label htmlFor="text">Add a sample</label>
            <textarea
              id="text"
              name="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste one of Raphaelle's best posts here."
              required
            />
          </div>
          <div className="row">
            <div className="form-row">
              <label htmlFor="content_source_id">Attributed to</label>
              <select id="content_source_id" name="content_source_id" defaultValue="">
                <option value="">— unspecified —</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="post_url">Original post URL (optional)</label>
              <input id="post_url" name="post_url" type="text" placeholder="https://x.com/..." />
            </div>
            <div className="form-row">
              <label htmlFor="notes">Notes (optional)</label>
              <input id="notes" name="notes" type="text" placeholder="Why this is a good example" />
            </div>
          </div>
          <button className="btn primary" type="submit" disabled={pending || !text.trim()}>
            {pending ? "Saving…" : "Add sample"}
          </button>
        </form>
      </div>

      <div className="section-title">
        <h2>Active ({active.length})</h2>
      </div>
      {active.length === 0 ? (
        <div className="empty">No active samples yet.</div>
      ) : (
        active.map((s) => (
          <SampleCard key={s.id} sample={s} onAction={wrap} pending={pending} />
        ))
      )}

      {inactive.length > 0 && (
        <>
          <div className="section-title">
            <h2>Inactive ({inactive.length})</h2>
          </div>
          {inactive.map((s) => (
            <SampleCard key={s.id} sample={s} onAction={wrap} pending={pending} />
          ))}
        </>
      )}
    </>
  );
}

function SampleCard({
  sample,
  onAction,
  pending,
}: {
  sample: VoiceSampleRow;
  onAction: (fn: (fd: FormData) => Promise<void>) => (fd: FormData) => void;
  pending: boolean;
}) {
  return (
    <div className="draft-row">
      <div className="draft-body">{sample.text}</div>
      <div className="draft-meta">
        {sample.content_source?.name ? (
          <span className="badge source">{sample.content_source.name}</span>
        ) : null}
        {sample.impressions != null && (
          <span title="Impressions">{sample.impressions.toLocaleString()} impr</span>
        )}
        {sample.engagements != null && <span>{sample.engagements} eng</span>}
        {sample.likes != null && <span>{sample.likes} ♥</span>}
        {sample.reposts != null && <span>{sample.reposts} ↻</span>}
        {sample.post_url ? (
          <a href={sample.post_url} target="_blank" rel="noreferrer">
            view ↗
          </a>
        ) : null}
      </div>
      {sample.notes ? <div className="meta-line">{sample.notes}</div> : null}
      <div className="draft-actions">
        <form action={onAction(toggleVoiceSampleAction)}>
          <input type="hidden" name="id" value={sample.id} />
          <input
            type="hidden"
            name="next_active"
            value={sample.is_active ? "false" : "true"}
          />
          <button className="btn small" type="submit" disabled={pending}>
            {sample.is_active ? "Deactivate" : "Activate"}
          </button>
        </form>
        <form action={onAction(deleteVoiceSampleAction)}>
          <input type="hidden" name="id" value={sample.id} />
          <button
            className="btn small danger"
            type="submit"
            disabled={pending}
            onClick={(e) => {
              if (!confirm("Delete this sample?")) e.preventDefault();
            }}
          >
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
