# Netflux

> A summary-first knowledge system for people who want to revisit, connect, and use ideas over time.

Netflux turns books, podcasts, articles, and videos into summaries, highlights, and saved ideas you can search, revisit, and use later. Built with Next.js, Supabase, and AI retrieval — public-first for discovery, then layered with authenticated reading progress, highlights, notes, and Ask My Library.

## What Ships Today

Recent delivery boundaries and unfinished work are tracked in [release status](docs/STATUS.md). This overview is not a fresh production verification.

- Public landing page, browse feed, search, focus mode, preview pages, reader pages, and public series pages
- Explicit weekly email subscription flow with subscription status and unsubscribe-token support
- Authenticated library features: saved items, continue reading, completed history, notes, ask, profile, and settings
- Reader features: quick mode, accordion-based deep reading, highlights, notes drawer, feedback, and scoped reader themes
- AI surfaces: Ask My Library, Ask These Notes, and author-style chat on content pages
- Admin tools: content CRUD, featured toggles, homepage sections, content series, media uploads, analytics, and embedding sync utilities

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase Auth, Postgres, Storage, and RPCs
- Vercel Analytics / Speed Insights
- AI SDK with Anthropic/OpenAI generation and Gemini embeddings
- Upstash Redis for production rate limiting

## Email Subscriptions

The landing-page newsletter form writes to `email_subscription`, not Supabase Auth. Newsletter consent is separate from user login: signing in does not automatically subscribe a user, and subscribing does not create an account.

Future weekly email delivery must embed the unsubscribe link for each recipient:

```text
/api/email-subscriptions/unsubscribe?token=<unsubscribe_token>
```

Treat `status = 'subscribed'` as the sendable audience and exclude `unsubscribed` rows from all email jobs.

## Local Development

```bash
npm install
cp .env.example .env.local
```

Then point `.env.local` at either:

- a local Supabase CLI stack, or
- a hosted Supabase project

Use [.env.example](.env.example) as the maintained configuration template and [OPS environment guidance](docs/OPS.md#12-environment-variables) for runtime and production requirements. Configure the values for the features you exercise:

| Feature | Required configuration |
| --- | --- |
| Supabase/auth and site metadata | Public Supabase URL/anon key, elevated server key where required, site URL |
| Library hydration and export | `SNAPSHOT_WORKER_DATABASE_URL`, `ACCOUNT_DATA_CURSOR_SECRET` |
| Snapshot maintenance | `SNAPSHOT_MAINTENANCE_DATABASE_URL`, `CRON_SECRET` |
| Catalog search cursors | `CATALOG_SEARCH_CURSOR_SECRET` |
| Notes search cursors | `ACCOUNT_DATA_CURSOR_SECRET` |
| AI generation/retrieval | Configured generation provider key and `GEMINI_API_KEY`; model settings are in the template |
| Production rate limiting and operations | Upstash credentials and applicable health/admin/notification settings listed in OPS |

Snapshot connections use the provisioned restricted worker/maintenance roles. These URLs and cursor secrets are server-only; never add a `NEXT_PUBLIC_` prefix or commit real values. Optional providers and telemetry settings are documented in the template.

Start the app:

```bash
npm run dev
```

If you are using a local Supabase stack, run the usual CLI flow first:

```bash
npx supabase start
npx supabase db reset
```

For hosted databases, follow the [isolated database release workflow](docs/OPS.md#22-disposable-hosted-database-verification). A linked project may be production; linking alone is not authorization to apply migrations.

## Useful Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run embeddings:sync-segments
```

## Project Shape

```text
app/                  App Router routes, layouts, metadata, and API handlers
components/           UI, reader, notes, focus, admin, and provider components
hooks/                Auth, highlights, reader settings, reading progress, media-query helpers
lib/                  Supabase clients, server helpers, AI support, rate limiting, domain utilities
supabase/migrations/  Database schema history, RLS, RPCs, and embedding support
tests/                Unit, component, API, database, security, and Playwright coverage
docs/                 Architecture, ops, API, design, and implementation notes
```

## Documentation

Start with the [documentation map](docs/INDEX.md). It identifies the owner for implementation status, architecture/API behavior, design, operations, contracts, and historical evidence. Agent working rules are in [AGENTS.md](AGENTS.md).

## Design-System Note

`design-system/netflux/*` is reference material for assistants and design exploration. The shipped source of truth is the app itself, especially `app/globals.css`, `components/ui/*`, and `docs/DESIGN.md`.

## Verification

Current baseline:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## License

Private project.
