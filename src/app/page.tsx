export default function Home() {
  return (
    <main>
      <h1>Twitter Orchestration Economics</h1>
      <p>
        Phase 1 scaffold. The publishing pipeline runs server-side; this page
        is a placeholder until the approval UI is built.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/test-publish</code> — publish one tweet (respects{" "}
          <code>DRY_RUN</code>).
        </li>
        <li>
          <code>GET /api/cron/scheduler</code> — Vercel cron entry point
          (stub).
        </li>
      </ul>
    </main>
  );
}
