# OPS.md: Operational Workflows

> **Status:** Active  
> **Purpose:** Development, deployment, admin operations, and troubleshooting for the current Netflux implementation.

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
NEXT_PUBLIC_SENTRY_DSN=...
```

Optional:

```env
OPENAI_API_KEY=...
OPENAI_FALLBACK_MODEL=gpt-4o-mini
NEXT_PUBLIC_APP_URL=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
AI_DAILY_MESSAGE_LIMIT=20
AI_WEEKLY_MESSAGE_LIMIT=100
AI_MONTHLY_MESSAGE_LIMIT=300
SENTRY_DSN=...
SENTRY_AUTH_TOKEN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
CRON_SECRET=...
RESEND_API_KEY=...
REQUEST_NOTIFICATION_FROM_EMAIL="Netflux <notifications@yourdomain.com>"
REQUEST_NOTIFICATION_REPLY_TO_EMAIL=...
```

Notes:

- `NEXT_PUBLIC_SITE_URL` drives metadata, sitemap, robots, and default OG URLs
- `NEXT_PUBLIC_APP_URL` is only used for API CORS header generation in `next.config.ts`
- `NEXT_PUBLIC_SENTRY_DSN` enables browser and server-side Sentry error monitoring
- `SENTRY_DSN` is optional when you want a separate server-side DSN; server monitoring falls back to `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are build-time settings for source map upload and should not be treated as runtime health requirements
- `CRON_SECRET` protects background worker routes such as AI narration processing
- `RESEND_API_KEY` and `REQUEST_NOTIFICATION_FROM_EMAIL` power transactional request-board notification emails
- `REQUEST_NOTIFICATION_REPLY_TO_EMAIL` is optional
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
2. Run `npm run lint && npm run typecheck && npm test && npm run build`.
3. Check `GET /api/health` and confirm the response is `ok`. Use `HEALTH_CHECK_SECRET` for detailed readiness and database monitoring.
4. Open `/admin` and confirm the launch-readiness panel plus the AI readiness badges and sync actions render.
5. Verify content and segment embedding coverage before treating Ask My Library as launch-ready.

Primary project scripts:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run validate:launch-env
HEALTH_CHECK_SECRET=... npm run check:deployment-health -- --url https://<your-production-domain>
```

CI runs:

- lint
- TypeScript typecheck
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

### 2.2 Disposable Hosted Database Verification

Run this gate before any database-facing production release. A [Supabase preview branch](https://supabase.com/docs/guides/deployment/branching) is preferred when the plan supports it. While production remains on the Free plan, use a separate short-lived hosted project as described below.

Hard stops:

- Use an isolated Supabase workdir. Never relink the repository workdir away from production.
- Record both project refs and prove that the candidate ref is not the production ref before any destructive command.
- Never run `db reset --linked` unless the isolated workdir's `.temp/project-ref` exactly matches the disposable candidate.
- Do not copy production users, personal data, content, database secrets, or Storage objects. Create synthetic fixtures only after the schema replay succeeds.
- Stop on any unexplained destructive diff, privilege expansion, schema mismatch, failing role test, advisor regression, type-contract mismatch, or application-smoke failure.

Create and link the candidate:

1. Create a temporary hosted project in the approved organization and region. Generate a unique database password and keep it only in a private temporary directory.
2. Create an isolated workdir and copy `supabase/` into it without copying the repository's `supabase/.temp` link metadata.
3. Link only that isolated workdir to the candidate project.
4. Verify the guard before proceeding:

```bash
test "$CANDIDATE_PROJECT_REF" != "$PRODUCTION_PROJECT_REF"
test "$(< "$CANDIDATE_WORKDIR/supabase/.temp/project-ref")" = "$CANDIDATE_PROJECT_REF"
```

Replay and compare:

```bash
npx supabase db push --linked --dry-run --workdir "$CANDIDATE_WORKDIR"
npx supabase db push --linked --workdir "$CANDIDATE_WORKDIR" --yes

# Destructive: permitted only after the candidate-ref guard above passes.
npx supabase db reset --linked --no-seed --workdir "$CANDIDATE_WORKDIR" --yes
npx supabase db push --linked --dry-run --workdir "$CANDIDATE_WORKDIR"

node scripts/compare-supabase-schema.mjs --candidate-workdir "$CANDIDATE_WORKDIR"
```

The final dry-run must report the candidate up to date, and the schema comparison must match every category. The fingerprint currently covers relations, columns, constraints, indexes, functions, function ACLs, policies, relation ACLs, views, triggers, relation comments, required extensions, enum definitions, and Storage buckets.

Generate fresh production and candidate database types into private temporary files. Compare them after normalizing only known platform metadata such as `__InternalSupabase.PostgrestVersion`; review every other difference. If the schema contract changed, update `types/database.ts`, remove obsolete casts or type-safety exceptions, and run `npm run typecheck`.

Run all candidate security checks with `SUPABASE_DB_URL` set to the candidate's direct or session-pooler URL:

```bash
npm run security:function-acls
npm run security:admin-rpc-acls
npm run security:analytics-rls
npm run security:embedding-table-reads
npm run security:storage-bucket-listing
```

Run DB-002's transactional behavior proof on local or explicitly disposable databases only:

```bash
SUPABASE_LOCAL=1 npm run database:highlight-preservation
DB002_TEST_DB_URL="$DISPOSABLE_DATABASE_URL" npm run database:highlight-preservation
```

The runner intentionally refuses the repository's normal linked database path. Never set `DB002_TEST_DB_URL` to production. The proof uses synthetic fixed fixtures, cleans them up in the same statement, and fails the release if edits, reorders, additions, removals, embeddings, artifacts, or highlights violate the DB-002 contract.

Set `SUPABASE_PROJECT_REF` to the candidate ref and run `npm run security:supabase-advisors`. Retrieve and review the performance advisor as well. An empty candidate can report more unused indexes than production; the difference must be explained, while schema/RLS/index-design findings must still match the intended release.

Application gate:

1. Create a synthetic confirmed admin profile, one synthetic verified content item, and its synthetic segment in the candidate only.
2. Build the application with candidate Supabase public and service credentials.
3. Start the production build on an isolated port and run `tests/e2e/production-smoke.spec.ts` with all optional smoke variables present.
4. Require all seven checks: login, missing-code callback, browse, public read, anonymous admin denial, authenticated admin RBAC, and shallow/detailed health.
5. Run repository typecheck and targeted lint for any changed verification code.

Production go/no-go:

- Verify a fresh production backup appropriate to the planned mutation.
- Confirm local/production migration parity and immutable recorded SQL.
- Run `db push --linked --dry-run` against production and review the exact proposed list.
- Obtain explicit production authorization for that exact list.
- After the push, require parity, clean dry-run, schema comparison, role/security checks, advisors, and proportionate application smoke checks.
- Treat the leaked-password-protection warning and other known launch controls as their owning readiness items; do not silently waive them as part of a migration replay.

Cleanup is mandatory even after a failed gate: delete the disposable hosted project, confirm it no longer appears in the project list, stop isolated application processes, and securely remove temporary passwords, API keys, generated types, fixtures, and workdirs. Do not stop or modify unrelated developer servers.

### 2.3 Email Subscription Operations

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

### 3.5 Request Notification Operations

Request-board published emails are transactional notifications, separate from weekly newsletter consent.

Flow:

- when an admin changes a request from a non-published status to `published` and links published content, voters are queued in `content_request_notifications`
- submitters are included because request submission automatically creates a vote
- queueing is idempotent with a unique `(request_id, user_id, type)` constraint
- the admin action schedules an immediate background processing attempt after the response returns
- recovery worker route: `GET /api/admin/request-notifications/process` for cron or external schedulers
- manual recovery route: `POST /api/admin/request-notifications/process` from an authenticated admin session
- cron auth: `Authorization: Bearer $CRON_SECRET`

Required provider configuration:

- `RESEND_API_KEY`
- `REQUEST_NOTIFICATION_FROM_EMAIL`
- verified sending domain in Resend for the configured sender address

Recipient controls:

- users can turn request-published emails on or off from `/settings`
- each email includes a direct opt-out link for request-published notification emails
- this preference does not subscribe or unsubscribe the user from weekly newsletter emails

If notifications remain queued, verify:

- the request has a linked `published_content_id`
- the recipient has a profile email
- `RESEND_API_KEY` and `REQUEST_NOTIFICATION_FROM_EMAIL` are configured
- the Resend sending domain is verified
- if you have configured a scheduler, `CRON_SECRET` matches the cron caller

### 3.6 AI Usage Quotas

Generated AI chat responses are counted against the authenticated user's shared AI message quota. Current default limits are:

- 20 messages per UTC day
- 100 messages per UTC week
- 300 messages per UTC month

The defaults can be overridden with `AI_DAILY_MESSAGE_LIMIT`, `AI_WEEKLY_MESSAGE_LIMIT`, and `AI_MONTHLY_MESSAGE_LIMIT`.

Quota applies to generated responses from Ask My Library, Ask These Notes, and signed-in Author Chat. Guest Author Chat is protected by the existing burst limiter but does not use daily, weekly, or monthly quotas because guests do not have a durable user id.

Stored recommended-prompt answers should not count against this quota if they return stored content without calling an AI provider. Generated answers should count.

Current implementation notes:

- quota is checked after auth, burst rate limiting, and request validation
- usage is recorded when a generated AI response is prepared
- quota rows are stored in `public.ai_message_usage`
- the current implementation uses separate day, week, and month count queries; this is acceptable at the current 300 messages/month/user default

Future scaling considerations:

- If quotas become tied to paid plans or hard credits, replace the app-level check-then-record flow with an atomic database reservation flow to avoid concurrent request overshoot.
- If quotas increase substantially or quota checks become a measurable latency source, consolidate the day, week, and month counts into a single Postgres RPC using filtered counts.

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

For admin access control in production:

- `ADMIN_ALLOWED_IPS`

`ADMIN_ALLOWED_IPS` is a comma-separated list of IPv4 or IPv6 addresses that may access `/admin-login`, `/admin/*`, and `/api/admin/*`. The app-level proxy in `proxy.ts` is the source of truth for admin path network access. Vercel Firewall rules may be added as defense in depth, but they are not a replacement for `ADMIN_ALLOWED_IPS` unless this runbook and launch validation are updated to verify that alternative control explicitly.

For anonymous reading analytics in production:

- `ANONYMOUS_ACTIVITY_SECRET`

`ANONYMOUS_ACTIVITY_SECRET` signs server-issued anonymous visitor tokens. Anonymous reading activity is accepted only when the visitor ID and token match, and the activity route additionally verifies that the content item is published and not deleted before updating aggregate analytics.

Important distinction:

- in development, the rate limiter can fall back to in-memory
- in production, most protected routes fail closed if Upstash is unavailable
- low-risk browse/personalization endpoints use best-effort rate limiting instead
- in non-production, unset `ADMIN_ALLOWED_IPS` leaves the admin IP gate open for local development
- in production, unset `ADMIN_ALLOWED_IPS` makes admin paths return a generic `404`

### 4.3 Preflight Environment Validation

Before a production deploy, verify:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- `SUPABASE_SERVICE_KEY` is set
- `NEXT_PUBLIC_SITE_URL` is a valid production URL
- `AI_PROVIDER`, `AI_MODEL`, and `AI_COMPLEX_MODEL` match the intended generation setup
- at least one of `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is present
- `GEMINI_API_KEY` is present for retrieval and embedding sync
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present in production
- `ADMIN_ALLOWED_IPS` is present and contains the operator IP addresses allowed to reach admin paths
- `ANONYMOUS_ACTIVITY_SECRET` is present for signed anonymous reading activity tokens
- if you have a scheduled narration worker, `CRON_SECRET` is present and matches the cron caller

Recommended validation steps:

```bash
npm run validate:launch-env
npm run lint
npm test
npm run build
HEALTH_CHECK_SECRET=... npm run check:deployment-health -- --url https://<your-production-domain>
```

If you want to validate a file instead of the current process environment, make the source explicit:

```bash
npm run validate:launch-env -- --env-file .env.local
```

Then confirm `/api/health` reports `ok` and `/api/admin/launch-readiness` is clean in the admin panel:

```bash
curl https://<your-production-domain>/api/health
curl -H "Authorization: Bearer $HEALTH_CHECK_SECRET" https://<your-production-domain>/api/health
```

The unauthenticated health response is intentionally a shallow liveness check. It does not validate environment configuration or query Supabase. Detailed readiness requires `HEALTH_CHECK_SECRET`; the database probe is cached briefly, concurrent probe refreshes are collapsed into one in-flight request per process, and slow probes fail fast as degraded. The launch-readiness endpoint is admin-only. Use `/admin` as the operator surface for that check.

If you wrap these checks in automation, keep the same order: env check, lint, test, build, health, admin readiness.

Then trigger one handled server error and one browser error in preview/staging and confirm both appear in Sentry. Browser boundary errors call `Sentry.captureException()` from `app/error.tsx` and `app/global-error.tsx`; API failures are captured through the shared `logApiError()` helper.

#### CI Security Gates

Production deploys should require the GitHub Actions `Security Validation` job from `.github/workflows/security.yml`.

The PR/push security gate runs without production database credentials:

```bash
npm run security:audit
npm run validate:launch-env
npm run test:security
SUPABASE_LOCAL=1 npm run security:function-acls
SUPABASE_LOCAL=1 npm run security:admin-rpc-acls
SUPABASE_LOCAL=1 npm run security:embedding-table-reads
SUPABASE_LOCAL=1 npm run security:storage-bucket-listing
SUPABASE_LOCAL=1 npm run security:analytics-rls
```

In CI, the workflow starts a local Supabase stack and resets it before SQL drift checks. That makes the check validate the schema produced by the PR migrations instead of stale production state, and it avoids exposing production database credentials to pull request runners.

The scheduled/manual `Supabase Advisor Audit` job uses these GitHub secrets when configured:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`

Supabase advisor results are an audit signal, not the real-time PR blocker, because advisor findings can lag behind schema changes. Exact accepted advisor findings are tracked in `scripts/supabase-security-advisor-allowlist.json`; unallowlisted `WARN` and `ERROR` findings fail the advisor audit when that job runs.

#### Production Verification Checklist

Before production promotion, run the full checklist against the exact deployment URL:

```bash
npm run verify:production -- --env-file <production-env> --base-url https://<deployment-domain>
```

The command runs the production dependency audit, launch env validation, Supabase advisors, direct Supabase SQL security checks, lint, typecheck, unit/security tests, build, and Playwright smoke tests.

Required production verification environment:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_URL`
- `HEALTH_CHECK_SECRET`
- `SMOKE_ADMIN_EMAIL`
- `SMOKE_ADMIN_PASSWORD`
- `SMOKE_READ_PATH`, set to a known public `/read/...` or `/preview/...` path

The same checklist can be run from GitHub Actions through the manual `Security Gates` workflow by providing `base_url`. The manual production job also runs Gitleaks and uses repository secrets plus the `SMOKE_READ_PATH` repository variable.

Admin path protection must be validated two ways: unauthenticated `/admin` access must redirect or be denied by the platform, and an admin smoke account from an allowed network must reach the admin dashboard. If the platform intentionally blocks the GitHub runner IP, run `npm run verify:production` from an allowed network before promotion.

#### Security Observability

Runtime security telemetry uses structured server logs as the complete event stream and throttled Sentry warning events for alert-grade summaries. The telemetry contract intentionally excludes raw IPs, hashed IPs, unsubscribe tokens, chat prompts, model responses, request bodies, cookies, authorization headers, API keys, and Supabase access tokens.

Admin route protection emits server-side security telemetry at both layers:

- `proxy.ts` emits edge-safe structured logs for admin IP gate blocks, unauthenticated protected admin access, and authenticated non-admin access. This layer intentionally logs to `console.warn` only because it runs in the Edge/proxy runtime.
- `/api/admin-login` handles admin password sign-in server-side, applies a strict login attempt rate limit, emits `admin_auth_failure` telemetry for failed attempts, and never logs credentials or raw Supabase auth payloads.

Recommended Sentry issue alerts:

- `security_signal=admin_auth_failure`: alert when repeated failures exceed the normal admin login pattern, for example 5 events in 10 minutes.
- `security_signal=invalid_unsubscribe_token`: alert on repeated malformed unsubscribe attempts, for example 10 events in 10 minutes.
- `security_signal=ai_rate_limit_exhausted`: alert on repeated AI/chat rate-limit exhaustion, for example 10 events in 10 minutes.
- `security_signal=ai_quota_exhausted`: lower-severity abuse/cost review signal.

High-volume events are throttled before Sentry capture on a best-effort, per warm runtime instance basis. Serverless cold starts and concurrent function instances can still produce more than one Sentry event per logical throttle window, so use Sentry as an alert-grade summary channel and use the structured server log stream for exact event counts and forensic review. Correlate app telemetry with CDN/WAF logs by `request_id`; do not add raw or hashed IP addresses to Sentry context.

Supabase advisor regressions are monitored by the scheduled/manual `Supabase Advisor Audit` GitHub Actions job, not runtime telemetry. Configure repository or team notifications so a failed `supabase-advisor-audit` job pages the security owner for review.

#### CSP Violation Reporting

Production CSP includes `report-uri /api/security/csp-report` and `report-to csp-endpoint`. The same-origin report endpoint rate-limits ingestion, strips query strings and raw script samples, and sends sanitized `CSP violation` warning events to Sentry.

To verify reporting after deploy, send a controlled report and confirm a sanitized Sentry event appears:

```bash
curl -X POST https://<your-production-domain>/api/security/csp-report \
  -H "Content-Type: application/csp-report" \
  --data '{"csp-report":{"document-uri":"https://<your-production-domain>/test?secret=redacted","violated-directive":"script-src","effective-directive":"script-src","blocked-uri":"inline","source-file":"https://<your-production-domain>/page?token=secret","line-number":1,"column-number":1,"script-sample":"sensitive inline sample"}}'
```

Expected response: `204 No Content`. The Sentry context must not include `original-policy`, raw `script-sample`, query strings, tokens, or other sensitive payload details.

#### CSP Inline Script Hardening Trial

Production responses also include a `Content-Security-Policy-Report-Only` trial policy for item 11. The report-only policy removes script `unsafe-inline` with `script-src 'self';` while the existing enforcing policy remains unchanged until staging/production reports prove that Next.js, Sentry, PostHog, Vercel Analytics, and Speed Insights still work under stricter enforcement.

After deploying to preview or staging, inspect the headers:

```bash
curl -I https://<your-production-domain>/ | grep -i "content-security-policy"
```

Expected:

- `Content-Security-Policy` is still the enforcing compatibility policy.
- `Content-Security-Policy-Report-Only` includes `script-src 'self';` and does not include script `unsafe-inline`.
- Both policies keep `report-uri /api/security/csp-report` and `report-to csp-endpoint`.

Review Sentry warning events tagged `source=csp`. Do not remove script `unsafe-inline` from the enforcing policy until report-only traffic is clean or each remaining violation has an accepted mitigation. If nonce CSP is required, validate the ISR/dynamic-rendering tradeoff route-by-route before rollout.

#### Sentry Deployment Status

Completed on 2026-06-18.

Verified:

- Vercel production exposes `NEXT_PUBLIC_SENTRY_DSN`; `/api/health` reports `error_reporting: "ready"`.
- Local launch environment validation passes with `NEXT_PUBLIC_SENTRY_DSN` configured.
- A controlled API/server event reached Sentry through `logApiError()`: `Netflux Sentry API verification event`.
- A controlled browser boundary event reached Sentry through `app/error.tsx`: `Netflux Sentry browser boundary verification event`.
- Browser events used the same-origin Sentry tunnel at `/error-monitoring`, keeping the current CSP compatible.

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
