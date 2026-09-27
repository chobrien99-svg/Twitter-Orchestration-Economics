import { notFound } from "next/navigation";
import Link from "next/link";
import { getDraft, listContentSources } from "@/lib/queries";
import { DraftEditForm } from "./DraftEditForm";

export const dynamic = "force-dynamic";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [draft, sources] = await Promise.all([getDraft(id), listContentSources()]);
  if (!draft) notFound();

  const posted = draft.status === "posted";

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Link href="/" className="btn small">
          ← Back to queue
        </Link>
      </div>
      <h1 style={{ marginTop: 0 }}>
        {posted ? "Posted" : draft.status === "failed" ? "Failed" : "Edit draft"}
      </h1>

      {draft.published_post?.permalink ? (
        <div className="card">
          <div className="meta-line">Live on X</div>
          <a href={draft.published_post.permalink} target="_blank" rel="noreferrer">
            {draft.published_post.permalink}
          </a>
        </div>
      ) : null}

      <DraftEditForm draft={draft} sources={sources} />
    </>
  );
}
