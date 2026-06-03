# PostHog Analytics Implementation And Verification

This document records what was implemented for the Netflux PostHog analytics pipeline and what has been verified locally.

## Implemented

### Client Initialization

- PostHog initializes from `instrumentation-client.ts`.
- Required public env vars:
  - `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
  - `NEXT_PUBLIC_POSTHOG_HOST`
  - `NEXT_PUBLIC_POSTHOG_UI_HOST`
- Production host should use the same-origin proxy:

```bash
NEXT_PUBLIC_POSTHOG_HOST=https://www.netflux.blog/flux
NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com
```

- Session recording is disabled initially.
- Autocapture is disabled so Netflux relies on explicit typed events.
- Native PostHog pageview capture is disabled to avoid duplicate App Router pageviews.
- `$pageleave` remains enabled for time-on-page and bounce metrics.
- `NEXT_PUBLIC_POSTHOG_CAPTURE_BOT_EVENTS=true` exists only for local Playwright verification. Do not set it in Vercel production.

### Same-Origin Proxy

- `next.config.ts` rewrites PostHog ingest through `/flux`.
- Legacy `/ingest` rewrites are kept as a compatibility alias.
- Current canonical ingest path:
  - `/flux/static/:path*`
  - `/flux/array/:path*`
  - `/flux/:path*`
- Because ingest is same-origin, CSP is covered by `connect-src 'self'`.

### Pageview Tracking

- `PostHogPageviewTracker` is mounted from the root app layout inside `<Suspense fallback={null}>`.
- It tracks App Router navigations explicitly using `usePathname()` and `useSearchParams()`.
- It avoids duplicate pageviews per URL key.
- It skips admin/auth callback routes.
- Safe pageview properties include:
  - `path`
  - `search_present`
  - `user_state`
  - `content_id` when applicable

### Identity Lifecycle

- Supabase auth state is wired into analytics identity.
- Signed-in users call `identifyAnalyticsUser(user.id, safeTraits)`.
- Sign-out calls `resetAnalyticsUser()`.
- Safe identity traits include:
  - `account_role`
  - `is_internal`
  - `profile_available`
- Email addresses are not sent by default.

### Event Contract

- `lib/analytics-events.ts` defines typed event contracts, required properties, allowed properties, privacy classification, and schema versioning.
- Events currently covered:
  - `signup_started`
  - `signup_completed`
  - `content_opened`
  - `content_completed`
  - `highlight_created`
  - `note_created`
  - `ai_chat_started`
  - `search_performed`
  - `library_saved`
  - `share_clicked`
  - `email_subscribed`
- Raw private payloads are not sent:
  - no raw note text
  - no highlighted passage text
  - no chat prompt text
  - no raw search query

### Server-Side Truth Events

- `posthog-node` is used for critical server-confirmed events.
- Server events are sent only after successful server/database outcomes where applicable.
- Server capture uses immediate flushing semantics so serverless functions do not drop queued events.

### Product Surface Instrumentation

Client and server events are wired across the main product surfaces:

- Auth form: `signup_started`
- Reader open: `content_opened`
- Reading completion: `content_completed`
- Save/bookmark success: `library_saved`
- Highlight success: `highlight_created`
- Note success: `note_created`
- AI chat success: `ai_chat_started`
- Search results: `search_performed`
- Share/copy success: `share_clicked`
- Email subscription success: `email_subscribed`

### Dashboards

- Dashboard spec lives at `config/posthog/netflux-dashboard-spec.mjs`.
- Dashboard sync script lives at `scripts/create-posthog-dashboards.mjs`.
- Runbook lives at `docs/analytics/posthog-dashboards.md`.
- Dashboards cover:
  - Acquisition
  - Activation
  - Engagement
  - Reading
  - Knowledge Actions
  - AI
  - Data Quality

## Proven Local Verification

These commands passed locally:

```bash
npm run typecheck
npm run lint
npm run build
npx vitest run tests/components/PostHogPageviewTracker.test.tsx
NEXT_PUBLIC_POSTHOG_HOST=/flux \
NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com \
NEXT_PUBLIC_POSTHOG_CAPTURE_BOT_EVENTS=true \
npx playwright test tests/e2e/analytics.spec.ts --project=chromium --reporter=line
```

The Playwright analytics spec verifies:

- first pageview capture
- client-side navigation pageview capture
- no duplicate pageviews for the same route
- same-origin `/flux` ingest requests
- CSP does not block same-origin ingest
- `signup_started` client event
- `search_performed` client event
- raw search query is not sent

The component test verifies:

- authenticated Supabase users are identified with safe traits
- sign-out resets the PostHog identity

The latest accessible Vercel deployment build logs were also checked and showed a clean production build for the available build/deployment data.

## Still Required After Deployment

These checks need real production traffic or authenticated production tooling:

1. PostHog Live Events
   - Deploy the current analytics changes.
   - Open PostHog Live Events.
   - Visit `https://www.netflux.blog`.
   - Trigger representative events: pageview, signup start, search, read open, save, note/highlight, share, email subscribe.
   - Confirm events arrive with expected safe properties.

2. Ad-blocker check
   - Use Brave or a browser with uBlock Origin enabled.
   - Visit production Netflux.
   - Trigger pageview and product events.
   - Confirm events still arrive in PostHog through `/flux`.

3. Runtime server-capture logs
   - Trigger server-side events in production, such as email subscription, library save, highlight, note, content completion, or AI chat.
   - Check Vercel runtime logs for `Failed to capture server analytics event`.
   - Build logs are not enough for this because server captures happen inside runtime API requests after deployment.

## Production Env Checklist

Set these in Vercel Production, Preview, and Development as appropriate:

```bash
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://www.netflux.blog/flux
NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com
```

Do not set this in production:

```bash
NEXT_PUBLIC_POSTHOG_CAPTURE_BOT_EVENTS=true
```

Do not commit personal PostHog API keys. Revoke any `phx_...` key that was pasted into chat, logs, or screenshots.
