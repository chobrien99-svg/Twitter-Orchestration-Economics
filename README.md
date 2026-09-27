# Twitter Orchestration Economics

Budget-aware X (Twitter) publishing pipeline. Schedules single posts, threads,
and media posts; ingests Substack and website updates; tracks per-API-call
cost against the X Usage plan.

Stack: Next.js 15 + TypeScript on Vercel, Supabase Postgres, `twitter-api-v2`.

## What this scaffold contains

- The full SQL schema (9 tables + a seeded `cost_estimates` reference table).
- A hello-world publish route at `POST /api/test-publish` (respects `DRY_RUN`).
- A publisher worker at `GET /api/cron/scheduler` — claims due drafts, posts
  to X, logs attempts and cost, retries up to 3 times on transient errors,
  and skips work when the daily budget is reached.
- A web UI (compose, review, edit, approve, schedule, history), gated by
  HTTP Basic Auth for a single shared team login.
- A `voice_samples` table plus a CSV importer for seeding it from
  Raphaelle's X analytics export.
- CLI helpers: `npm run draft`, `npm run publish-now`,
  `npm run import-voice-samples`.
- Server-side X and Supabase client wrappers.

It does **not** yet contain: LLM-driven draft generation, thread
sequencing, media upload, or Substack RSS ingestion.

## First-run setup

### 1. Create the Supabase project

1. Create a new project at <https://supabase.com>.
2. Open the SQL Editor and run `supabase/migrations/0001_initial_schema.sql`.
3. From **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Get your X credentials ready

From the X Developer Console, your app needs **OAuth 1.0a User Context**
credentials with **Read and Write** permissions:

- API Key → `X_API_KEY`
- API Key Secret → `X_API_KEY_SECRET`
- Access Token → `X_ACCESS_TOKEN`
- Access Token Secret → `X_ACCESS_TOKEN_SECRET`

If your access token was generated **before** flipping the app to Read+Write,
regenerate it — old tokens keep their old scope.

### 3. Local development

```bash
npm install
cp .env.example .env.local
# fill in keys in .env.local — leave DRY_RUN=true for now
npm run dev
```

Test the publish route in dry-run mode:

```bash
curl -X POST http://localhost:3000/api/test-publish \
  -H 'content-type: application/json' \
  -d '{"text":"hello from the pipeline"}'
```

Expected response: `{ "ok": true, "dryRun": true, ... }` — no API call to X.

### 4. Deploy to Vercel

```bash
# from the repo root
vercel link
vercel env add X_API_KEY production
# ...repeat for each variable in .env.example
vercel deploy --prod
```

Set `CRON_SECRET` to a random string in Vercel project env. The scheduler
route refuses any request without that bearer token, so external callers
cannot trigger publishing.

### 5. Send your first real tweet

When you are ready to spend real money:

1. Set `DRY_RUN=false` in Vercel env.
2. Redeploy (or trigger a redeploy so the new env propagates).
3. Hit `POST /api/test-publish` with a short body.
4. Verify the returned `xPostId` resolves at the `permalink` returned.

### 6. Apply the UI schema and set app-auth creds

Run `supabase/migrations/0002_ui_schema.sql` in the Supabase SQL Editor.
Then add these to `.env.local` and to Vercel's Environment Variables:

```
APP_USERNAME=<pick a shared username>
APP_PASSWORD=<pick a strong shared password>
```

The Basic-Auth middleware gates every route except `/api/cron/*` (which
uses `CRON_SECRET`) and `/api/test-publish` (kept open for CLI smoke
tests). Share the username / password with anyone who should reach the
approval UI.

### 7. Seed voice samples

Drop your X analytics content export into `data/x_content_analytics.csv`
(matches the standard columns from X&apos;s dashboard export), then:

```bash
npm run import-voice-samples             # inserts top 15 by engagements
npm run import-voice-samples -- --top 25 # tune how many
npm run import-voice-samples -- --dry-run
```

Re-running is safe — rows are upsert-keyed on `x_post_id`.

## Web UI

The Next.js app is the primary interface. Routes:

- `/` — dashboard. Draft queue by state, today&apos;s spend vs cap, live/dry-run indicator.
- `/compose` — write a new post, pick source, schedule for future, save as draft or approve.
- `/drafts/[id]` — edit, approve/unapprove, delete, view the live tweet if posted.
- `/voice-samples` — view, add, deactivate, or delete voice samples.

Every page requires the Basic-Auth login. The cron worker keeps ticking
in the background — anything marked `approved` will be published on the
next tick if it&apos;s past its `scheduled_at`.

## Scheduling drafts (local CLI, still supported)

```bash
# Insert an approved draft scheduled for now (publishes on next cron tick).
npm run draft -- "hello from the pipeline"

# Schedule for 5 minutes from now.
npm run draft -- "delayed hello" --in 5m

# Specific UTC timestamp.
npm run draft -- "scheduled post" --at 2026-04-29T15:00:00Z

# Insert as draft (will not auto-publish until status is changed to 'approved').
npm run draft -- "needs review" --status draft
```

Trigger the publisher manually (without waiting for cron):

```bash
npm run publish-now
```

Or call the cron route from a running dev server:

```bash
curl http://localhost:3000/api/cron/scheduler
```

Both print a summary like:

```json
{
  "ok": true,
  "dryRun": true,
  "spentUsdBefore": 0,
  "spentUsdAfter": 0,
  "dailyBudgetUsd": 2,
  "posted": 1,
  "failedFatal": 0,
  "failedRetryable": 0,
  "budgetSkipped": 0,
  "contestedSkipped": 0,
  "dueDrafts": 1
}
```

While `DRY_RUN=true`, drafts move through the full lifecycle (rows in
`publish_attempts`, `published_posts`, `budget_ledger`) but no API call is
made and `estimated_cost_usd` is logged as 0. Flip `DRY_RUN=false` to send
real tweets.

## Budget controls

The X Usage plan bills per request. Pricing seeded into `cost_estimates`:

| Operation | USD |
|---|---|
| `create_post` (text only) | 0.0100 |
| `create_post_with_url` | 0.0200 |
| `media_upload` | 0.0100 |
| `media_init` | 0.0100 |
| `media_append` | 0.0100 |
| `media_finalize` | 0.0100 |

`DAILY_BUDGET_USD` is the soft cap. Before each draft, the publisher sums
today's `budget_ledger` rows; if the next call would exceed the cap, it
skips the draft (leaves it `approved`, picks up next tick once budget
resets at UTC midnight).

## Build sequence from here

1. ~~Test-publish round-trip~~ ✅
2. ~~Publisher worker + draft CLI~~ ✅
3. ~~Web UI (compose, review, approve, history) + voice-samples seeded~~ ✅
4. **LLM draft generator** — Claude turns a Substack article URL into 3
   variants in Raphaelle&apos;s voice, calibrated with the seeded samples.
5. **Tweet doctor** — Claude scores an in-progress draft (hook, clarity, length).
6. **Threads** — sequence x_post_drafts by `position`, set `reply_to_post_id`.
7. **Media upload** — chunked init/append/finalize → attach to draft.
8. **Substack RSS ingestion** — auto-fire the generator on new articles.

## Repository layout

```
src/
  app/
    api/
      test-publish/route.ts      hello-world publisher (DRY_RUN aware)
      cron/scheduler/route.ts    publisher worker entry point
    layout.tsx
    page.tsx
  lib/
    budget.ts                    today's spend + cost lookup helpers
    env.ts                       typed env access with required/optional helpers
    publisher.ts                 publisher worker (claim, publish, log, retry)
    supabase.ts                  service-role server client
    x-client.ts                  twitter-api-v2 user-context client
scripts/
  draft.ts                       insert a draft into x_post_drafts
  publish-now.ts                 run publisher once, locally
supabase/
  migrations/
    0001_initial_schema.sql      9 tables + cost_estimates seed
vercel.json                      cron config (every minute)
```
