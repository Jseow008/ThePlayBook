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
AI_MODEL=claude-sonnet-4-20250514
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
```

Notes:

- `NEXT_PUBLIC_SITE_URL` drives metadata, sitemap, robots, and default OG URLs
- `NEXT_PUBLIC_APP_URL` is only used for API CORS header generation in `next.config.ts`
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

Primary project scripts:

```bash
npm run lint
npm test
npm run build
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

### 3.3 Embeddings

Content-level embeddings:

- endpoint: `POST /api/admin/embeddings/sync`
- behavior: processes verified content items that still have `embedding IS NULL`

Segment-level Gemini embeddings:

- status endpoint: `GET /api/admin/embeddings/sync-segments`
- local backfill command:

```bash
npm run embeddings:sync-segments
```

Dry run:

```bash
npm run embeddings:sync-segments -- --dry-run
```

This is intentionally a local trusted-machine workflow now. `POST /api/admin/embeddings/sync-segments` returns `405`.

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

### 4.3 Metadata and Web Surfaces

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
