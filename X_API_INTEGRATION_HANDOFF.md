# X API Integration Handoff

## Context
This handoff summarizes planning discussions for building an X (X.com) publishing pipeline for a client with:
- a high-visibility Substack,
- an upcoming 200-page manifesto,
- a new website,
- and limited marketing resources.

Primary goal: maximize visibility on X with a lean, low-maintenance workflow.

---

## Agreed Priority Use Cases
1. Schedule and publish X posts:
   - single posts,
   - threads,
   - media posts.
2. Auto-post from external systems:
   - Substack,
   - website/blog/product updates.

---

## Recommended MVP Scope
Build in phases, starting with reliable publishing first.

### Phase 1 (Reliability Core)
- Schedule single posts.
- Schedule thread sequences.
- Attach media.
- Status workflow: `draft -> approved -> scheduled -> posted/failed`.
- Retry + failure alerts.

### Phase 2 (Automation)
- Ingest Substack and website updates (RSS/webhook).
- Auto-generate multiple draft variants per article:
  - short link post,
  - insight post,
  - thread draft.
- Keep human approval before publish in initial rollout.

---

## Proposed Data Model (MVP)
Suggested entities:
- `content_sources`
- `source_items`
- `x_post_drafts`
- `x_threads`
- `media_assets`
- `draft_media_map`
- `published_posts`
- `publish_attempts`
- `budget_ledger`

Core intent:
- preserve source-of-truth for inbound content,
- manage draft/scheduling lifecycle,
- log publishing outcomes and retries,
- track estimated vs actual usage costs.

---

## Publishing Pipeline Algorithm
Recommended worker model:
1. **Ingest worker**: source polling/webhook processing.
2. **Draft worker**: content-to-draft generation.
3. **Scheduler worker**: select due approved items.
4. **Publisher worker**: media upload -> publish -> retry/error handling.

Key guardrails:
- idempotency key to prevent duplicate sends,
- retry only retryable errors (429/5xx/network),
- cap retries (e.g., max 3),
- pause downstream thread items if a thread step fails.

---

## Budget Inputs Captured
Client provided estimated pricing:
- Create content unit cost: **$0.010 per request**
- Posts containing URL: **$0.020 per request**
- Upload Media: **$0.010 per request**
- Initialize Media: **$0.010 per request**
- Append Media: **$0.010 per request**
- Finalize Media: **$0.010 per request**

Interpretation:
- text-only post costs are low (1–2 cents each based on URL inclusion),
- media posts require multiple API steps and can cost several cents per published media post,
- early-stage cadence likely remains within modest monthly budget if usage is controlled.

---

## Clarified Platform Responsibilities
Important beginner clarification:
- **X Developer Console** is for app setup, credentials, auth permissions, usage, and billing.
- **Your own application** handles scheduling logic, draft workflows, ingest, and API calls.
- **Your database** stores drafts/threads/logs/cost tracking.
- **Hosting platform** runs workers reliably over time.

In short: implementation is built in your app, not inside X Developer Console.

---

## Recommended Next Build Steps
1. Set up X app credentials in Developer Console.
2. Build minimal local script to publish one test post.
3. Add database-backed scheduling for single posts.
4. Add thread sequencing.
5. Add media upload flow.
6. Add ingestion from Substack/website.
7. Add budget guardrails (daily cap, threshold alerts, auto-pause).

---

## "Articles" vs "Posts" Guidance
Adopt both concepts in your internal model:
- **Article**: long-form source (Substack post, website article, manifesto section).
- **Post**: X distribution unit (single, thread item, media post).

Recommended mapping:
- one article -> many X posts/threads.

This supports scalable repurposing while preserving editorial source context.

---

## Suggested GitHub Follow-Up Tasks
Create issues for:
1. X auth + app setup checklist.
2. DB schema implementation.
3. Publisher worker (single post).
4. Thread publish sequencing.
5. Media upload support.
6. Ingest worker (Substack + site).
7. Budget ledger and alerting.
8. Approval UI/workflow.

---

## Notes
- Start with a conservative launch: manual approvals + text-heavy tests.
- Add automation gradually after reliability is proven.
- Keep budget controls enabled from day one.
