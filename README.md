# Flux

> **Continuous flow of knowledge.** Distilled wisdom from podcasts, books, and articles — made accessible for everyone.

## What is Flux?

Flux is a **public knowledge platform** where curated summaries of high-value content are published for free consumption. Think of it as a personal stream of distilled insights.

### Features

- **Quick Mode**: Get the key takeaways in bullet points
- **Deep Mode**: Read the full, structured summary with context
- **Interactive Checklists**: Track your progress on actionable items
- **Progress Tracking**: Pick up where you left off (stored locally, no account needed)
- **Netflix-style UI**: Beautiful hero carousel and category lanes
- **Featured Content**: Spotlight the best content in the hero section

### Content Types

- 🎧 **Podcasts** — Episode summaries and key insights
- 📚 **Books** — Chapter breakdowns and actionable takeaways
- 📰 **Articles** — Condensed versions of long-form content

### Categories

Health • Fitness • Wealth • Finance • Productivity • Mindset • Relationships • Science • Business • Philosophy • Technology • Lifestyle

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Validation**: Zod
- **Drag & Drop**: dnd-kit
- **Deployment**: Vercel

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Apply hosted database migrations (if needed)
npx supabase db push

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
/app
  /(public)       # Public pages (home, search, random)
  /read/[id]      # Content reader page
  /admin          # Protected admin panel
  /admin-login    # Admin login page
  /api            # API routes
/components
  /admin          # Admin UI components
  /reader         # Reader view components
  /ui             # Shared UI components
/lib              # Utilities and Supabase clients
/types            # TypeScript type definitions
/supabase         # Database migrations and seed data
/docs             # Architecture and design documentation
```

## Admin Panel

Access the admin panel at `/admin-login` with a Supabase account that has `profiles.role = 'admin'`.

**Admin Features:**
- Create/edit content items
- Manage segments with drag-and-drop reordering
- Add interactive checklists
- Toggle featured status for hero carousel
- Upload cover images
- Filter by status and featured flag

## Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — System design and data model
- [DESIGN.md](./docs/DESIGN.md) — UI/UX design system
- [AGENT.md](./docs/AGENT.md) — Implementation roadmap
- [API_SPECS.md](./docs/API_SPECS.md) — API contracts
- [OPS.md](./docs/OPS.md) — Operational workflows

## Recent UX Hardening

The latest production-focused pass tightened the public app shell, route data loading, and failure handling:

- Public detail pages now use shared server loaders so `/preview/[id]` and `/read/[id]` derive metadata and page data from the same fetch path.
- The landing page no longer blocks on a server-side auth lookup. Logged-in users are redirected client-side to `/browse` after hydration.
- Focus mode now fetches the first batch immediately, then removes completed items once reading progress hydrates and backfills replacements as needed.
- Search keeps trending content limited to empty-state views while category stats are loaded through a dedicated shared helper.
- Content feedback only shows success after confirmed API writes and rolls back optimistic UI on failure.
- Rate limiting now requires Upstash Redis in production. In-memory fallback remains development-only.
- Low-risk read-only personalization endpoints such as recommendations, focus feed, and content batch now degrade gracefully if the shared rate-limit backend is temporarily unavailable, so browse personalization does not disappear.

## Verification

Current verification baseline for these changes:

```bash
npm test
npm run lint
npm run build
```

## License

Private project.
