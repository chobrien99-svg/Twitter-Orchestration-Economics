import Link from "next/link";
import type { DraftRow } from "@/lib/queries";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function relativeFromNow(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  const hr = Math.round(abs / 3_600_000);
  const day = Math.round(abs / 86_400_000);
  const sign = ms < 0 ? "ago" : "from now";
  if (min < 60) return `${min}m ${sign}`;
  if (hr < 48) return `${hr}h ${sign}`;
  return `${day}d ${sign}`;
}

export function DraftRowView({ draft }: { draft: DraftRow }) {
  const sourceName = draft.content_source?.name;
  return (
    <div className="draft-row">
      <div className="draft-body">{draft.body}</div>
      <div className="draft-meta">
        <span className={`badge ${draft.status}`}>{draft.status}</span>
        {sourceName ? <span className="badge source">{sourceName}</span> : null}
        {draft.contains_url ? (
          <span className="badge" title="Contains URL — costs $0.02 vs $0.01">
            has link
          </span>
        ) : null}
        <span title={draft.scheduled_at ?? ""}>
          {draft.status === "posted"
            ? `posted ${fmtDate(draft.published_post?.posted_at ?? draft.updated_at)}`
            : `for ${fmtDate(draft.scheduled_at)} · ${relativeFromNow(draft.scheduled_at)}`}
        </span>
        {draft.published_post?.permalink ? (
          <a href={draft.published_post.permalink} target="_blank" rel="noreferrer">
            view on X ↗
          </a>
        ) : null}
      </div>
      <div className="draft-actions">
        <Link href={`/drafts/${draft.id}`} className="btn small">
          Open
        </Link>
      </div>
    </div>
  );
}
