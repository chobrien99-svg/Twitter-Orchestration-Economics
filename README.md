# Twitter Orchestration Economics

Budget-aware X (Twitter) publishing pipeline. Schedules single posts, threads,
and media posts; ingests Substack and website updates; tracks per-API-call
cost against the X Usage plan.

Stack: Next.js 15 + TypeScript on Vercel, Supabase Postgres, `twitter-api-v2`.

## What this scaffold contains

This is the Phase-1 starting point. It includes:

- The full SQL schema (9 tables + a seeded `cost_estimates` reference table).
- A hello-world publish route at `POST /api/test-publish` (respects `DRY_RUN`).
- A Vercel cron stub at `GET /api/cron/scheduler` (publisher logic comes next).
- Server-side X and Supabase client wrappers.

It does **not** yet contain: the publisher worker, thread sequencing, media
upload, ingest workers, the budget guard, or the approval UI. Those layer on
top once the hello-world round-trip is verified.

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

`DAILY_BUDGET_USD` is the soft cap. Once the publisher worker is wired, it
will sum today's `budget_ledger` rows before each request and pause if the
next call would cross the cap.

## Build sequence from here

1. **Test-publish round-trip** — confirm a single tweet posts successfully.
2. **Scheduler core** — read approved drafts, publish, log attempts and cost.
3. **Idempotency** — every draft gets an `idempotency_key`; retries reuse it.
4. **Threads** — sequence x_post_drafts by `position`, set `reply_to_post_id`.
5. **Media upload** — chunked init/append/finalize → attach to draft.
6. **Substack ingestion** — RSS poll cron → `source_items` → draft variants.
7. **Approval UI** — Next.js page with Supabase Auth (single shared login).
8. **Budget enforcement** — daily cap auto-pause + alert.

## Repository layout

```
src/
  app/
    api/
      test-publish/route.ts      hello-world publisher (DRY_RUN aware)
      cron/scheduler/route.ts    Vercel cron entry point (stub)
    layout.tsx
    page.tsx
  lib/
    env.ts                       typed env access with required/optional helpers
    supabase.ts                  service-role server client
    x-client.ts                  twitter-api-v2 user-context client
supabase/
  migrations/
    0001_initial_schema.sql      9 tables + cost_estimates seed
vercel.json                      cron config (every minute)
```
