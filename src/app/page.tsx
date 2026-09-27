import Link from "next/link";
import { DraftRowView } from "./DraftRowView";
import {
  listDraftsByStatus,
  listRecentPosted,
  listRecentFailed,
  getTodaySpendUsd,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [pending, upcoming, posted, failed, spent] = await Promise.all([
    listDraftsByStatus(["draft"]),
    listDraftsByStatus(["approved", "scheduled", "publishing"]),
    listRecentPosted(10),
    listRecentFailed(5),
    getTodaySpendUsd(),
  ]);

  const dailyBudget = Number(process.env.DAILY_BUDGET_USD ?? "2.00");
  const dryRun = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";

  return (
    <>
      <div className="row" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="meta-line">Today&apos;s spend</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>
            ${spent.toFixed(2)} <span className="meta-line">/ ${dailyBudget.toFixed(2)}</span>
          </div>
        </div>
        <div className="card">
          <div className="meta-line">Mode</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>
            {dryRun ? "DRY RUN" : "LIVE"}
          </div>
        </div>
        <div className="card" style={{ display: "flex", alignItems: "center" }}>
          <Link href="/compose" className="btn primary">
            + New post
          </Link>
        </div>
      </div>

      <section>
        <div className="section-title">
          <h2>Awaiting review</h2>
          <span className="count">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="empty">No drafts awaiting review.</div>
        ) : (
          pending.map((d) => <DraftRowView key={d.id} draft={d} />)
        )}
      </section>

      <section>
        <div className="section-title">
          <h2>Approved &amp; scheduled</h2>
          <span className="count">{upcoming.length}</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="empty">Nothing scheduled.</div>
        ) : (
          upcoming.map((d) => <DraftRowView key={d.id} draft={d} />)
        )}
      </section>

      {failed.length > 0 && (
        <section>
          <div className="section-title">
            <h2>Failed / skipped</h2>
            <span className="count">{failed.length}</span>
          </div>
          {failed.map((d) => (
            <DraftRowView key={d.id} draft={d} />
          ))}
        </section>
      )}

      <section>
        <div className="section-title">
          <h2>Recently posted</h2>
          <span className="count">{posted.length}</span>
        </div>
        {posted.length === 0 ? (
          <div className="empty">No posts yet.</div>
        ) : (
          posted.map((d) => <DraftRowView key={d.id} draft={d} />)
        )}
      </section>
    </>
  );
}
