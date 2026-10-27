"use client";

import { useTransition, useState } from "react";
import { deleteDraftAction } from "./actions";

/**
 * Inline delete for a draft on the dashboard. Posted/publishing drafts
 * aren't deletable (the server action enforces this too) — the button
 * just isn't rendered for them.
 */
export function DeleteDraftButton({
  draftId,
  status,
}: {
  draftId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "posted" || status === "publishing") return null;

  const handleClick = () => {
    if (!confirm("Delete this draft? Cannot be undone.")) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", draftId);
    startTransition(async () => {
      try {
        await deleteDraftAction(fd);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // deleteDraftAction redirects to "/" on success; re-throw so Next handles it.
        if (msg.includes("NEXT_REDIRECT")) throw err;
        setError(msg);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        className="btn small danger"
        onClick={handleClick}
        disabled={pending}
        title="Delete this draft"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span className="meta-line" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </>
  );
}
