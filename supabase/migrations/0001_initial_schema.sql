-- =====================================================================
-- Twitter Orchestration Economics — initial schema
-- =====================================================================
-- This migration creates the 9 core tables described in the handoff doc
-- plus a seeded cost_estimates reference table for the X Usage plan.
--
-- Apply via: Supabase SQL Editor, or `supabase db push` if you use the CLI.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. content_sources — where articles come from (Substack, blog, etc.)
-- ---------------------------------------------------------------------
create table content_sources (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null check (kind in ('substack','rss','website','manual','webhook')),
  url           text,
  config        jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. source_items — individual articles ingested from a source
-- ---------------------------------------------------------------------
create table source_items (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references content_sources(id) on delete cascade,
  external_id     text,
  title           text,
  url             text,
  body            text,
  published_at    timestamptz,
  raw             jsonb not null default '{}'::jsonb,
  ingested_at     timestamptz not null default now(),
  unique (source_id, external_id)
);

create index source_items_source_idx on source_items (source_id, published_at desc);

-- ---------------------------------------------------------------------
-- 3. media_assets — uploaded images/videos, tracked separately so a
--    single asset can be reused across drafts.
-- ---------------------------------------------------------------------
create table media_assets (
  id                uuid primary key default gen_random_uuid(),
  storage_path      text not null,           -- Supabase Storage object path
  mime_type         text not null,
  size_bytes        bigint,
  alt_text          text,
  x_media_id        text,                    -- populated after upload to X
  x_media_uploaded_at timestamptz,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. x_threads — a sequence container; single posts have no thread.
-- ---------------------------------------------------------------------
create table x_threads (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  status        text not null default 'draft'
                check (status in ('draft','approved','scheduled','publishing','posted','failed','paused')),
  scheduled_at  timestamptz,
  source_item_id uuid references source_items(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. x_post_drafts — one row per X post. position is 1-based within
--    a thread; null thread_id means a single post.
-- ---------------------------------------------------------------------
create table x_post_drafts (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid references x_threads(id) on delete cascade,
  position          integer not null default 1,
  body              text not null,
  contains_url      boolean not null default false,
  status            text not null default 'draft'
                    check (status in ('draft','approved','scheduled','publishing','posted','failed','skipped')),
  scheduled_at      timestamptz,
  source_item_id    uuid references source_items(id) on delete set null,
  idempotency_key   text unique,             -- prevents duplicate sends on retry
  reply_to_post_id  text,                    -- X post id of the previous thread item
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index x_post_drafts_status_sched_idx
  on x_post_drafts (status, scheduled_at)
  where status in ('approved','scheduled');

create unique index x_post_drafts_thread_position_idx
  on x_post_drafts (thread_id, position)
  where thread_id is not null;

-- ---------------------------------------------------------------------
-- 6. draft_media_map — many-to-many between drafts and media assets.
-- ---------------------------------------------------------------------
create table draft_media_map (
  draft_id    uuid not null references x_post_drafts(id) on delete cascade,
  media_id    uuid not null references media_assets(id) on delete restrict,
  position    integer not null default 1,
  primary key (draft_id, media_id)
);

-- ---------------------------------------------------------------------
-- 7. published_posts — one row per successfully posted X tweet.
-- ---------------------------------------------------------------------
create table published_posts (
  id              uuid primary key default gen_random_uuid(),
  draft_id        uuid not null unique references x_post_drafts(id) on delete restrict,
  x_post_id       text not null unique,
  permalink       text,
  posted_at       timestamptz not null default now(),
  response_payload jsonb
);

-- ---------------------------------------------------------------------
-- 8. publish_attempts — every API attempt, success or failure.
--    Powers retries, debugging, and reconciliation with x_post_id.
-- ---------------------------------------------------------------------
create table publish_attempts (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid not null references x_post_drafts(id) on delete cascade,
  attempt_no    integer not null,
  status        text not null check (status in ('success','retryable_error','fatal_error','dry_run')),
  http_status   integer,
  error_code    text,
  error_message text,
  request_payload  jsonb,
  response_payload jsonb,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index publish_attempts_draft_idx on publish_attempts (draft_id, attempt_no);

-- ---------------------------------------------------------------------
-- 9. budget_ledger — every billable API call, estimated and actual cost.
--    Daily cap query (range form, uses the btree index below):
--      select coalesce(sum(estimated_cost_usd), 0)
--      from budget_ledger
--      where occurred_at >= date_trunc('day', now())
--        and occurred_at <  date_trunc('day', now()) + interval '1 day';
-- ---------------------------------------------------------------------
create table budget_ledger (
  id                  uuid primary key default gen_random_uuid(),
  occurred_at         timestamptz not null default now(),
  api_operation       text not null,         -- e.g. 'create_post','create_post_with_url','media_init'
  draft_id            uuid references x_post_drafts(id) on delete set null,
  attempt_id          uuid references publish_attempts(id) on delete set null,
  estimated_cost_usd  numeric(10,4) not null,
  actual_cost_usd     numeric(10,4),
  notes               text
);

create index budget_ledger_occurred_at_idx on budget_ledger (occurred_at);

-- ---------------------------------------------------------------------
-- Reference: cost_estimates — seeded from X Usage plan pricing.
-- Update rows here when X changes pricing; the publisher reads from
-- this table to decide what to log into budget_ledger.
-- ---------------------------------------------------------------------
create table cost_estimates (
  api_operation       text primary key,
  unit_cost_usd       numeric(10,4) not null,
  description         text,
  updated_at          timestamptz not null default now()
);

insert into cost_estimates (api_operation, unit_cost_usd, description) values
  ('create_post',           0.0100, 'Create a post (text only, no URL).'),
  ('create_post_with_url',  0.0200, 'Create a post containing a URL.'),
  ('media_upload',          0.0100, 'Single-shot media upload.'),
  ('media_init',            0.0100, 'Chunked media upload — INIT phase.'),
  ('media_append',          0.0100, 'Chunked media upload — APPEND chunk.'),
  ('media_finalize',        0.0100, 'Chunked media upload — FINALIZE phase.');

-- ---------------------------------------------------------------------
-- updated_at trigger (shared)
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger content_sources_updated_at
  before update on content_sources
  for each row execute function set_updated_at();

create trigger x_threads_updated_at
  before update on x_threads
  for each row execute function set_updated_at();

create trigger x_post_drafts_updated_at
  before update on x_post_drafts
  for each row execute function set_updated_at();
