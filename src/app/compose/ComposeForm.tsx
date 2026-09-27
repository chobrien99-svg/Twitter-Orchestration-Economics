"use client";

import { useMemo, useState, useTransition } from "react";
import { createDraftAction } from "../actions";
import type { ContentSource } from "@/lib/queries";
import { classifyLength, POST_HARD_LIMIT, POST_SOFT_LIMIT } from "@/lib/post-limits";

function localInputDefault(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 5);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ComposeForm({ sources }: { sources: ContentSource[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const state = classifyLength(text.length);
  const overHard = state === "over";
  const long = state === "long";

  const defaultScheduled = useMemo(localInputDefault, []);

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          try {
            await createDraftAction(formData);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Next.js redirects throw NEXT_REDIRECT — that's success, not an error.
            if (msg.includes("NEXT_REDIRECT")) throw err;
            setError(msg);
          }
        });
      }}
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="form-row">
        <label htmlFor="text">Post text</label>
        <textarea
          id="text"
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What are we posting?"
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
          <label htmlFor="scheduled_at">Publish at (your local time)</label>
          <input
            id="scheduled_at"
            name="scheduled_at"
            type="datetime-local"
            defaultValue={defaultScheduled}
          />
          <span className="form-hint">
            Leave a few minutes out so you can still edit before it fires.
          </span>
        </div>

        <div className="form-row">
          <label htmlFor="status">Save as</label>
          <select id="status" name="status" defaultValue="draft">
            <option value="draft">Draft (needs approval)</option>
            <option value="approved">Approved (publisher will pick up)</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn primary"
          type="submit"
          disabled={pending || overHard || text.trim().length === 0}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
