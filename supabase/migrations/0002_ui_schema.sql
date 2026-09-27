-- =====================================================================
-- 0002 — UI layer schema
-- =====================================================================
-- Adds:
--   * voice_samples table (Raphaelle's best-performing posts, used to
--     calibrate the LLM draft generator in the next session).
--   * x_post_drafts.content_source_id — direct FK so manual drafts
--     composed in the UI can be tagged with their source Substack /
--     website without needing a source_items row.
--   * Seeded rows in content_sources for the two Substacks + a "manual"
--     placeholder for one-off posts.
-- =====================================================================

-- Source tagging on drafts ---------------------------------------------
alter table x_post_drafts
  add column content_source_id uuid references content_sources(id) on delete set null;

create index x_post_drafts_source_idx on x_post_drafts (content_source_id)
  where content_source_id is not null;

-- Voice samples --------------------------------------------------------
create table voice_samples (
  id                uuid primary key default gen_random_uuid(),
  content_source_id uuid references content_sources(id) on delete set null,
  x_post_id         text unique,                    -- original post id, if known
  post_url          text,
  text              text not null,
  posted_at         timestamptz,
  impressions       integer,
  likes             integer,
  engagements       integer,
  reposts           integer,
  replies           integer,
  bookmarks         integer,
  url_clicks        integer,
  detail_expands    integer,
  notes             text,
  is_active         boolean not null default true,  -- toggle a sample off without deleting
  created_at        timestamptz not null default now()
);

create index voice_samples_active_idx on voice_samples (is_active, engagements desc);

-- Seed the two Substack sources plus a manual bucket -------------------
insert into content_sources (name, kind, url, is_active) values
  ('Decoding Discontinuity',     'substack', 'https://www.decodingdiscontinuity.com', true),
  ('Orchestration Economics',    'substack', 'https://www.orchestration-economics.com', true),
  ('Manual composition',         'manual',   null, true)
on conflict do nothing;
