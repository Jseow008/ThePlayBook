# Flux

> Read once. Remember everything.

Flux is a knowledge system for non-fiction readers. It turns books, podcasts, articles, and videos into structured summaries you can read in minutes, highlight for keeps, and query with AI when the idea becomes useful again. Built with Next.js, Supabase, and AI retrieval — public-first for discovery, then layered with authenticated reading progress, highlights, notes, and Ask My Library.

## What Ships Today

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

The app expects at least:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
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
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Start the app:

```bash
npm run dev
```

If you are using a local Supabase stack, run the usual CLI flow first:

```bash
npx supabase start
npx supabase db reset
```

If you are targeting a hosted project, apply migrations through the linked project instead.

## Useful Scripts

```bash
npm run dev
npm run lint
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
tests/                Playwright coverage
docs/                 Architecture, ops, API, design, and implementation notes
```

## Documentation

- [docs/POSITIONING.md](./docs/POSITIONING.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/API_SPECS.md](./docs/API_SPECS.md)
- [docs/OPS.md](./docs/OPS.md)
- [docs/DESIGN.md](./docs/DESIGN.md)
- [docs/BRAND_GUIDELINES.md](./docs/BRAND_GUIDELINES.md)
- [docs/AGENT.md](./docs/AGENT.md)

## Design-System Note

`design-system/flux/*` is reference material for assistants and design exploration. The shipped source of truth is the app itself, especially `app/globals.css`, `components/ui/*`, and `docs/DESIGN.md`.

## Verification

Current baseline:

```bash
npm test
npm run lint
npm run build
```

## License

Private project.
