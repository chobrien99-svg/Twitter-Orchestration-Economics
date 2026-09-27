"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { generateFromUrlAction, type GenerateResult } from "./actions";

const KIND_LABEL: Record<string, string> = {
  hook: "Hook post",
  insight: "Insight",
  thread_start: "Thread starter",
};

export function GenerateUI() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <form
        action={(formData: FormData) => {
          setResult(null);
          startTransition(async () => {
            const r = await generateFromUrlAction(formData);
            setResult(r);
          });
        }}
        style={{ marginBottom: 20 }}
      >
        <div className="form-row">
          <label htmlFor="url">Article URL</label>
          <input
            id="url"
            name="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.decodingdiscontinuity.com/p/..."
            required
          />
          <span className="form-hint">
            Works with decodingdiscontinuity.com, orchestration-economics.com,
            or any public article URL.
          </span>
        </div>
        <button
          className="btn primary"
          type="submit"
          disabled={pending || !url.trim()}
        >
          {pending ? "Reading & drafting… (this takes 15–45s)" : "Generate 3 drafts"}
        </button>
      </form>

      {result && !result.ok && <div className="error">{result.error}</div>}

      {result?.ok && (
        <>
          <div className="card">
            <div className="meta-line">Source article</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{result.article.title}</div>
            <a href={result.article.url} target="_blank" rel="noreferrer">
              {result.article.url}
            </a>
            {result.article.excerpt && (
              <p className="meta-line" style={{ marginTop: 8, marginBottom: 0 }}>
                {result.article.excerpt}
              </p>
            )}
          </div>

          <div className="section-title">
            <h2>Generated drafts ({result.drafts.length})</h2>
            <span className="count">
              {result.usage.model} · in {result.usage.inputTokens}
              {result.usage.cacheReadTokens > 0 &&
                ` (${result.usage.cacheReadTokens} cached)`}{" "}
              / out {result.usage.outputTokens}
            </span>
          </div>

          {result.drafts.map((d) => (
            <div key={d.id} className="draft-row">
              <div className="draft-meta">
                <span className="badge draft">{KIND_LABEL[d.kind] ?? d.kind}</span>
                <span>{d.text.length} chars</span>
                {d.overLimit && (
                  <span className="badge failed">over 280 — edit before approving</span>
                )}
              </div>
              <div className="draft-body">{d.text}</div>
              {d.reasoning && (
                <div className="meta-line" style={{ fontStyle: "italic" }}>
                  {d.reasoning}
                </div>
              )}
              <div className="draft-actions">
                <Link href={`/drafts/${d.id}`} className="btn small primary">
                  Open to edit / approve
                </Link>
              </div>
            </div>
          ))}

          <div className="meta-line" style={{ marginTop: 16 }}>
            All three saved as unapproved drafts. Open each one to edit, then
            approve — the publisher won&apos;t touch them until you do.
          </div>
        </>
      )}
    </>
  );
}
