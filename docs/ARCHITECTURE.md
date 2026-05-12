# ARCHITECTURE.md: Flux

> **Status:** Active  
> **Last Updated:** March 2026  
> **Goal:** Keep the docs aligned with the implementation that currently ships.

## 1. Product Shape

Flux is a public-first reading product for curated knowledge. Visitors can discover and read content without logging in. Authenticated users add cross-device state on top: saved items, reading progress, highlights, notes, reading history, and AI chat. Admin users manage publishing, series, homepage sections, media uploads, and embedding operations.

Email newsletter subscription is a separate consent surface from login. A visitor can subscribe to weekly emails without creating an account, and a logged-in user is not automatically subscribed.

## 2. Route Zones

### 2.1 Public Discovery

- `/` marketing landing page
- `/browse` browse feed with featured items plus configurable homepage sections
- `/search` public search across verified content
- `/focus` quick-take swipe/feed experience
- `/preview/[id]` preview page for a content item
- `/read/[id]` full reader page
- `/series/[slug]` public series page
- `/about`, `/privacy`, `/terms`

These routes prefer the cookie-free public Supabase client so they remain cache-friendly.

The landing page may write newsletter subscriptions through `/api/email-subscriptions`; that write path uses a server route and service-role Supabase client rather than exposing table access to the browser.

### 2.2 Authenticated Workspace

- `/login`
- `/ask`
- `/notes`
- `/profile`
- `/settings`
- `/library/my-list`
- `/library/reading`
- `/library/completed`

These routes use the cookie-bound Supabase SSR client and redirect unauthenticated users to `/login`.

### 2.3 Admin

- `/admin`
- `/admin/content/new`
- `/admin/content/[id]/edit`
- `/admin/sections`
- `/admin/series`
- `/admin/insights`
- `/admin-login`

Admin access is enforced twice:

- `proxy.ts` gates `/admin*` and `/api/admin/*`
- route handlers and server code re-check with `verifyAdminSession()`

## 3. Runtime Architecture

### 3.1 App Shell

- `app/layout.tsx` sets global fonts, global CSS, ambient background, React Query provider, `sonner`, and Vercel telemetry
- `app/(public)/layout.tsx` wraps public app routes with auth and reading-progress providers
- `components/ui/PublicLayoutShell.tsx` conditionally applies app chrome based on the current route

### 3.2 Supabase Client Split

- `lib/supabase/public-server.ts`
  - cookie-free client for public pages and read-only public APIs
- `lib/supabase/server.ts`
  - cookie-aware SSR client for authenticated routes and handlers
- `lib/supabase/admin.ts`
  - service-role client for admin-only operations and storage uploads
- `lib/supabase/middleware.ts`
  - refreshes auth cookies for routes that pass through the proxy

This split is important: public SEO pages avoid `cookies()` whenever possible, while authenticated flows still get SSR auth.

### 3.3 Shared Public Content Loaders

`lib/server/public-content.ts` centralizes the public fetch path for:

- page metadata
- preview page data
- read page data
- series page data

That avoids drift between `/preview/[id]`, `/read/[id]`, and metadata generation.

## 4. Data Model Overview

### 4.0 Email Subscriptions

- `email_subscription`
  - stores explicit consent to receive weekly Flux emails
  - tracks `status`, `subscribed_at`, `unsubscribed_at`, `consent_text`, `consent_version`, and `unsubscribe_token`
  - is distinct from `auth.users` and `profiles`
  - send jobs must target only `status = 'subscribed'`

Any future newsletter/email template must include an unsubscribe link using:

```text
/api/email-subscriptions/unsubscribe?token=<unsubscribe_token>
```

### 4.1 Core Content

- `content_item`
  - main content row
  - types: `podcast`, `book`, `article`, `video`
  - includes quick mode JSON, featured flag, optional audio URL, optional series assignment
- `segment`
  - ordered long-form content blocks for the reader
- `artifact`
  - interactive attachments
  - current implementation uses checklist artifacts

### 4.2 Discovery and Editorial Structure

- `homepage_section`
  - configurable browse/feed lanes for the public home feed
- `content_series`
  - public series pages plus ordered items inside a series

### 4.3 User Data

- `profiles`
  - role and profile metadata
- `user_library`
  - bookmarks and reading progress snapshot
- `user_highlights`
  - highlights, note bodies, colors, optional anchors
- `reading_activity`
  - reading history used for heatmaps and recent activity
- `content_feedback`
  - thumbs up/down plus optional reason/details

### 4.4 AI / Retrieval

- `content_item.embedding`
  - content-level embeddings
- `segment_embedding_gemini`
  - Gemini-based segment embeddings for library retrieval
- RPCs back retrieval and aggregation flows such as:
  - recommendations
  - Gemini segment coverage
  - reading activity logging
  - homepage section item assembly

## 5. Reader Architecture

The current reader is a single-column accordion reader, not the older three-column layout.

- `components/reader/ReaderView.tsx`
  - orchestrates reading progress, highlights, feedback, notes drawer, and theme state
- `hooks/useReadingProgress.ts`
  - owns local/remote progress hydration and persistence behavior
- `hooks/useHighlights.ts`
  - highlight CRUD client integration
- `hooks/useReaderSettings.ts`
  - reader theme, font, and spacing preferences

Reader themes are scoped separately from the browse UI:

- `reader-dark`
- `reader-light`
- `reader-sepia`

## 6. AI Architecture

### 6.1 Generation

- Default chat provider is Anthropic via `AI_PROVIDER=anthropic`
- Default chat model is Haiku via `AI_MODEL=claude-haiku-4-5-20251001`
- Ask My Library synthesis and hybrid requests can use Sonnet via `AI_COMPLEX_MODEL=claude-sonnet-4-20250514`
- OpenAI is supported as fallback for chat routes that allow it
- AI responses are streamed through the AI SDK

### 6.2 Retrieval

- `/api/chat`
  - authenticated “Ask My Library”
  - combines library metadata with Gemini segment retrieval
- `/api/chat/notes`
  - authenticated “Ask These Notes”
  - grounded only in highlights currently in scope
- `/api/chat/author`
  - author-style chat over the segments of a single content item

### 6.3 Embeddings

- `/api/admin/embeddings/sync`
  - syncs missing content-level embeddings for verified items
- `npm run embeddings:sync-segments`
  - local CLI backfill for Gemini segment embeddings
- `/api/admin/embeddings/sync-segments`
  - reports coverage and returns the local command to run

## 7. Rendering and Caching

- `/` uses ISR with `revalidate = 3600`
- `/browse`, `/preview/[id]`, `/read/[id]`, `/series/[slug]` use shorter revalidation windows
- public APIs such as recommendations and content batch set cache headers directly
- personalization endpoints with low product risk use best-effort rate limiting so browse experiences degrade more gracefully

## 8. Security Model

- Content Security Policy and CORS headers are set in `next.config.ts`
- admin and authenticated routes rely on Supabase Auth cookies
- admin APIs require both session presence and `profiles.role = 'admin'`
- production rate-limited routes expect Upstash Redis; non-production can fall back to in-memory limits

## 9. Current Architectural Notes

- The shipped product brand is `Flux`
- `design-system/flux/*` is not a runtime source of truth
- some older docs and generated artifacts may still describe the pre-refactor homepage or reader; defer to `app/`, `components/`, and this file when they disagree
