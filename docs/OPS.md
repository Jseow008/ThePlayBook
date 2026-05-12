# OPS.md: Operational Workflows

> **Status:** Active  
> **Purpose:** Development, deployment, admin operations, and troubleshooting for the current Flux implementation.

## 1. Local Development

### 1.1 Install and Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app can run against either:

- a local Supabase CLI stack, or
- a hosted Supabase project

The old docs implied a hosted-only workflow. That is no longer accurate enough for this repo because `.env.example` still defaults to local-style Supabase values.

### 1.2 Environment Variables

Required app/runtime variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
NEXT_PUBLIC_SITE_URL=...
AI_PROVIDER=anthropic
AI_MODEL=claude-haiku-4-5-20251001
AI_COMPLEX_MODEL=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
```

Optional:

```env
OPENAI_API_KEY=...
OPENAI_FALLBACK_MODEL=gpt-4o-mini
NEXT_PUBLIC_APP_URL=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
ERROR_REPORTING_WEBHOOK_URL=...
ERROR_REPORTING_BEARER_TOKEN=...
CRON_SECRET=...
```

Notes:

- `NEXT_PUBLIC_SITE_URL` drives metadata, sitemap, robots, and default OG URLs
- `NEXT_PUBLIC_APP_URL` is only used for API CORS header generation in `next.config.ts`
- `ERROR_REPORTING_WEBHOOK_URL` is the production exception sink used by API failures and the root/app error boundaries
- `ERROR_REPORTING_BEARER_TOKEN` is optional when your ingest endpoint expects bearer auth
- `CRON_SECRET` protects background worker routes such as AI narration processing
- OAuth client credentials are typically configured in Supabase/provider dashboards rather than read directly by this app

### 1.3 Supabase Migrations

If you are using a local Supabase stack:

```bash
npx supabase start
npx supabase db reset
```

If you are using a hosted project:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Rule: keep schema changes in `supabase/migrations/`. Do not rely on dashboard-only edits.

## 2. Testing and Verification

Use the launch-validation sequence below before a production push or after a preview deploy:

1. Validate production env values against `.env.example`.
2. Run `npm run lint`, `npm test`, and `npm run build`.
3. Check `GET /api/health` and confirm the response is `ok`.
4. Open `/admin` and confirm the launch-readiness panel plus the AI readiness badges and sync actions render.
5. Verify content and segment embedding coverage before treating Ask My Library as launch-ready.

Primary project scripts:

```bash
npm run lint
npm test
npm run build
npm run validate:launch-env
npm run check:deployment-health -- --url https://<your-production-domain>
```

CI runs:

- lint
- Vitest
- Next.js build
- Playwright

Relevant config:

- `vitest.config.ts`
- `playwright.config.ts`
- `tests/setup.ts`
- `.github/workflows/ci.yml`

### 2.1 Launch Smoke Checklist

Use this checklist after the validation sequence above:

- `GET /browse` loads content and the first card opens a preview
- `GET /preview/[id]` renders title, CTA, and metadata
- `GET /read/[id]` renders segments and reader controls
- `/login` signs in and `/auth/callback` redirects back to the requested page
- Landing-page newsletter subscription returns success and creates or reactivates an `email_subscription` row
- Newsletter unsubscribe links using `/api/email-subscriptions/unsubscribe?token=<unsubscribe_token>` mark the row `unsubscribed`
- `/admin-login` reaches an admin session
- Admin-only routes reject non-admins with `401` or `403`
- Create a content item, upload a cover image, save, and publish
- Refresh `/browse`, `/search`, `/preview/[id]`, and `/read/[id]` after publish
- Run content embedding sync for new or edited verified content
- Check Gemini segment coverage for verified items before using Ask My Library

If any of the above fails, stop the launch and fix the underlying route or environment issue before retrying.

Category taxonomy note: Phase 1 keeps temporary aliases for old public search links. Before removing them, confirm old category URLs have no meaningful traffic, then follow the Phase 2 checklist in `docs/CATEGORY_TAXONOMY.md`.

### 2.2 Email Subscription Operations

Newsletter subscription is not the same as login. Do not automatically subscribe users when they sign in.

Sendable audience:

```sql
select *
from public.email_subscription
where status = 'subscribed';
```

Future weekly email jobs must:

- include only `status = 'subscribed'` rows
- embed the per-recipient unsubscribe URL:

```text
/api/email-subscriptions/unsubscribe?token=<unsubscribe_token>
```

- stop sending to a recipient immediately after their row becomes `unsubscribed`
- preserve consent metadata (`consent_text`, `consent_version`, `subscribed_at`) for auditability

## 3. Admin Operations

### 3.1 Admin Access

Admin users sign in through `/admin-login`. Access is considered valid only when:

- the user has a Supabase session, and
- `profiles.role = 'admin'`

Useful bootstrap script:

```bash
node scripts/create-admin.mjs
```

### 3.2 Content Management

Admin tools currently cover:

- content CRUD
- featured toggles
- homepage sections
- content series
- image uploads to the `media` bucket
- audio uploads to the `audio` bucket
- insights

### 3.3 Launch Readiness and Embeddings

Content-level embeddings:

- endpoint: `POST /api/admin/embeddings/sync`
- readiness view: `GET /api/admin/embeddings/sync`
- behavior: processes verified content items that still have `embedding IS NULL`
- use when a verified item is newly published or its title, author, category, or quick mode changes

Segment-level Gemini embeddings:

- status endpoint: `GET /api/admin/embeddings/sync-segments`
- response includes coverage summary, AI readiness, and the local sync and dry-run commands
- local backfill command:

```bash
npm run embeddings:sync-segments
```

Dry run:

```bash
npm run embeddings:sync-segments -- --dry-run
```

This is intentionally a local trusted-machine workflow now. `POST /api/admin/embeddings/sync-segments` returns `405`.

Operator rule:

- after any verified content publish or edit, run content embeddings sync first
- then check `/api/admin/embeddings/sync-segments`
- if the response shows missing verified segments, run the local backfill command from a trusted machine
- do not treat Ask My Library as launch-ready until verified content coverage is clean
- the admin dashboard shows the same readiness state in `/admin` and `/admin/content/[id]/edit`

### 3.4 AI Narration Operations

AI narration now runs as a queued background job.

Operator workflow:

- queue narration from `/admin` or `/admin/content/[id]/edit`
- let the background worker pick up queued jobs automatically
- use the persisted row status to monitor `queued`, `processing`, `ready`, or `failed`
- use the edit page only when you need the full narration detail panel or manual audio upload

Background worker:

- queue route: `POST /api/admin/content/[id]/narration`
- status route: `GET /api/admin/content/[id]/narration`
- worker route: `GET /api/admin/narration/process` for cron or external schedulers
- manual recovery route: `POST /api/admin/narration/process`
- queueing a narration job also schedules a server-side background attempt immediately after the response returns
- current production path on Vercel Hobby: there is no platform cron configured
- queued narration still runs immediately through the server-side `after(...)` handoff
- if you are deploying on a plan with scheduled jobs, point your scheduler at the same worker route instead

Optional scheduled recovery worker:

- the worker route supports cron-style invocation and drains up to 3 queued jobs before exiting
- cron auth: `Authorization: Bearer $CRON_SECRET`
- if you upgrade Vercel to Pro, restore a `vercel.json` cron for `/api/admin/narration/process`
- if you are not deploying on Vercel, use any external scheduler against the same worker route

Recovery path:

- `POST /api/admin/narration/process` drains up to 3 queued narration jobs from an authenticated admin session
- `POST /api/admin/narration/reset` marks stale `processing` jobs as failed so they can be re-queued cleanly
- `/admin` now includes a `Retry Narration Jobs` control that shows the active processing titles, surfaces stale jobs, and can reset stale `processing` jobs on demand

If narration remains stuck in `queued`, verify:

- the initial `after(...)` background handoff is succeeding
- if you have configured a scheduler, `CRON_SECRET` is configured in production
- if you have configured a scheduler, the worker route returns `200` when invoked with the cron secret
- OpenAI and Supabase storage credentials are healthy

If narration remains stuck in `processing`, verify:

- the row has not exceeded the 2-hour stale-processing safety window
- the admin maintenance panel identifies the current processing title and whether it is stale
- use the stale reset control if the job is clearly orphaned
- stale `processing` rows are automatically failed the next time the narration worker or per-item narration status route touches them

## 4. Deployment

### 4.1 App Hosting

The Next.js app is intended for Vercel deployment.

Build command:

```bash
next build
```

### 4.2 Production Environment Expectations

At minimum, production needs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- AI provider keys used by your deployment

For rate-limited routes in production:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Important distinction:

- in development, the rate limiter can fall back to in-memory
- in production, most protected routes fail closed if Upstash is unavailable
- low-risk browse/personalization endpoints use best-effort rate limiting instead

### 4.3 Preflight Environment Validation

Before a production deploy, verify:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- `SUPABASE_SERVICE_KEY` is set
- `NEXT_PUBLIC_SITE_URL` is a valid production URL
- `AI_PROVIDER`, `AI_MODEL`, and `AI_COMPLEX_MODEL` match the intended generation setup
- at least one of `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is present
- `GEMINI_API_KEY` is present for retrieval and embedding sync
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present in production
- if you have a scheduled narration worker, `CRON_SECRET` is present and matches the cron caller

Recommended validation steps:

```bash
npm run validate:launch-env
npm run lint
npm test
npm run build
npm run check:deployment-health -- --url https://<your-production-domain>
```

If you want to validate a file instead of the current process environment, make the source explicit:

```bash
npm run validate:launch-env -- --env-file .env.local
```

Then confirm `/api/health` reports `ok` and `/api/admin/launch-readiness` is clean in the admin panel:

```bash
curl https://<your-production-domain>/api/health
```

The launch-readiness endpoint is admin-only. Use `/admin` as the operator surface for that check.

If you wrap these checks in automation, keep the same order: env check, lint, test, build, health, admin readiness.

Then trigger one handled server error and one browser error in preview/staging and confirm both appear in your monitoring sink. Browser boundary errors post through `/api/monitor/exceptions`; API failures emit directly from the server helper.

### 4.4 Metadata and Web Surfaces

These routes/files are generated from runtime configuration:

- `app/manifest.ts`
- `app/robots.ts`
- `app/sitemap.ts`

## 5. Troubleshooting

### 5.1 `Missing Supabase environment variables`

Check:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`

### 5.2 Public pages show no content

Check:

- content status is `verified`
- `deleted_at` is null
- migrations and RLS policies are applied
- ISR cache has revalidated or the page was revalidated by admin actions

### 5.3 Admin routes redirect or return 401/403

Check:

- active Supabase session
- `profiles.role = 'admin'`
- auth callback flow is working for the current site URL / forwarded host

### 5.4 Chat routes fail

Check:

- `ANTHROPIC_API_KEY` for default generation
- `GEMINI_API_KEY` for library retrieval embeddings and sync
- `OPENAI_API_KEY` only if you expect fallback generation

### 5.5 Rate-limited routes fail only in production

Check:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

If those are missing, production behavior is expected to be stricter than local development.

### 5.6 Backup and Restore Drill

Run one backup and one restore drill before launch:

- confirm the database backup/export path you will actually use in production
- restore that backup into a disposable environment
- verify public browse, admin login, and one representative content item after restore
- verify the restore does not break `profiles.role = 'admin'`, content visibility, or embedding coverage

Record:

- where the backup was taken from
- where it was restored
- who ran the drill
- what failed, if anything
