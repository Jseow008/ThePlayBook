# AGENT.md: Implementation Status

> **Status:** Active  
> **Role:** Working snapshot of what is implemented today, not the original MVP pitch.  
> **Positioning:** Netflux is a summary-first knowledge system for people who want to revisit, connect, and use ideas over time. See [POSITIONING.md](./POSITIONING.md) for messaging and audience strategy.

## 1. Shipped Product Areas

### 1.1 Public Experience

- marketing landing page
- browse feed with featured items and configurable homepage sections
- public search
- focus mode
- preview pages
- full reader pages
- public series pages

### 1.2 Authenticated Experience

- login and auth callback flow
- saved items, in-progress items, completed items
- synced reading progress
- highlights and notes
- Ask My Library
- Ask These Notes
- profile and reading heatmap
- settings with profile update, data export, local progress clearing, and sign-out

### 1.3 Admin Experience

- content CRUD
- featured toggles
- image upload
- audio upload
- homepage section management
- content series management
- insights dashboard
- content embedding sync and segment coverage tools

## 2. Technical Baseline

- Next.js 16 App Router
- React 19
- Tailwind CSS v4
- Supabase Auth / Postgres / Storage
- AI SDK for streaming
- Anthropic generation with Haiku by default and Sonnet reserved for synthesis/hybrid Ask My Library requests
- OpenAI fallback generation where supported
- Gemini embeddings for retrieval
- Upstash-backed production rate limiting

## 3. Architectural Decisions Worth Preserving

- public SEO routes use a cookie-free Supabase client where possible
- authenticated routes use SSR auth with Supabase cookies
- admin access is checked in both the proxy and route/server code
- shared loaders in `lib/server/public-content.ts` keep preview/read metadata aligned
- segment embedding sync is now a local trusted-machine workflow, not a remote admin mutation

## 4. Current Constraints

- the shipped product brand is `Netflux`
- `design-system/netflux/*` is reference-only
- some historical docs may still describe the older landing page or reader layout; prefer the live code and current docs set

## 5. Likely Next Review Areas

- doc drift whenever route behavior changes
- large client-side reader complexity in `ReaderView`
- notes/ask UX as chat scope behavior evolves
- rate-limit posture and production env hygiene
