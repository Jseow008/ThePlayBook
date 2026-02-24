# OPS.md: Operational Workflows

> **Status:** Active  
> **Purpose:** Development, deployment, and maintenance procedures for Flux.

---

## 1. Development Workflow

### 1.1 Start Development Server

**Note:** The database, authentication, and storage are now hosted on Supabase Cloud. No local Docker setup is required.

```bash
# Start Next.js development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

The app connects to the hosted Supabase instance configured in `.env.local`.

### 1.2 Database Migrations

**Rule:** Never edit the database via Supabase Dashboard. Always use migrations.

```bash
# Generate a migration after schema changes
npx supabase db diff -f descriptive_name

# Apply migrations to local instance (resets data)
npx supabase db reset

# Apply migrations without reset (riskier)
npx supabase db push
```

### 1.3 Seed Data

Seeds are automatically applied on `db reset` if `supabase/seed.sql` exists.

```bash
# Manual seed (if needed)
psql $DATABASE_URL -f supabase/seed.sql
```

### 1.4 Environment Variables

| File | Purpose |
| --- | --- |
| `.env.local` | Development & Production (Next.js) |
| `.env.example` | Template for required vars |

**Required Variables:**
```env
# Supabase (Hosted)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# OAuth & API Additions
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OPENAI_API_KEY=...
```

> **Note:** These environment variables now point to the hosted Supabase instance. Get these values from your Supabase project dashboard.

---

## 2. Deployment

### 2.1 Next.js App → Vercel

**Trigger:** Push to `main` branch.

**Build Command:** `next build`

**Environment Variables (Vercel):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`

### 2.2 Database → Supabase (Hosted)

**Current Setup:** The database is hosted on Supabase Cloud and shared between development and production.

**Database URL:** `https://xmuqsgfxuaaophxnwure.supabase.co`

**Migrations (if needed):**
1. Link project: `npx supabase link --project-ref xmuqsgfxuaaophxnwure`
2. Push migrations: `npx supabase db push`

### 2.3 Domain & SSL

Configured via Vercel dashboard. SSL is automatic.

### 2.4 Google OAuth Setup (Custom Domain)

To present the custom domain instead of the default `supabase.co` on the Google OAuth consent screen:
1. Configure custom domain in Supabase project settings.
2. Ensure Vercel custom domain redirects correctly.
3. Add the custom domain callback URL to Google Cloud Platform OAuth Client ID (`https://customdomain.com/auth/v1/callback`).

### 2.5 SEO & PWA Generation

- **Robots & Sitemap**: `app/robots.ts` and `app/sitemap.ts` dynamically generate SEO metadata based on live content categories and dynamic routes.
- **PWA Manifest**: `app/manifest.ts` generates standard PWA assets dynamically.
- App icons and favicons are generated dynamically via Next.js metadata API where applicable.

---

## 3. Content Management

Content is managed via the admin panel.

### 3.1 Adding New Content

1. Go to `/admin-login` and sign in with an admin account
2. Navigate to `/admin` dashboard
3. Click "New Content"
4. Fill in:
   - Title, Author, Type (podcast/book/article)
   - Category
   - Source URL (optional)
   - Cover image (upload or URL)
   - Quick Mode content (hook, big idea, takeaways)
5. Add segments (ordered sections of the summary)
   - Drag to reorder segments
   - Add title and markdown body
   - Include timestamps for audio/video content
6. Add artifacts (optional)
   - Create checklists with items
   - Mark mandatory items
7. Save as Draft or Verify (Publish)

### 3.2 Editing Content

1. Go to `/admin`
2. Click on content item row
3. Make changes
4. Save

### 3.3 Featuring Content

Toggle the star icon next to content items to add/remove from homepage hero carousel. Maximum 5 featured items recommended.

### 3.4 Unpublishing Content

Change status from "Verified" to "Draft" to hide from public.

### 3.5 Bulk Imports & AI Processing

For large imports, use SQL scripts via `supabase/seed.sql` and apply with `psql`.

**Syncing Embeddings:**
After bulk uploads or edits, utilize the "Sync Missing Embeddings" button in the admin interface to submit unvectorized items to the AI pipeline for pgvector representation generation.

### 3.6 Admin Session Flow

1. Admin visits `/admin-login` and signs in through Supabase Auth.
2. After sign-in, server components and API handlers verify session + `profiles.role = 'admin'`.
3. Admin APIs run only when `verifyAdminSession()` passes.
4. `/admin/*` routes redirect to `/admin-login` when the current user is not an admin.

---

## 4. Troubleshooting

### 4.1 "Relation does not exist"

**Cause:** Migrations haven't been applied.

**Fix:**
```bash
npx supabase db reset
```

### 4.2 Content not showing on homepage

**Possible causes:**
1. Content status is "draft" (must be "verified")
2. ISR cache not invalidated yet (wait up to 1 hour)
3. `deleted_at` is set

**Fix for cache:** Redeploy or wait for revalidation.

### 4.3 Admin login not working

**Possible causes:**
1. The user is not authenticated in Supabase
2. `profiles.role` is not set to `admin`
3. Supabase keys are misconfigured

**Fix:** Verify Supabase auth state, ensure admin role in `profiles`, and confirm environment variables.

### 4.4 Featured content not in hero

**Possible causes:**
1. Content not verified
2. `is_featured` not set to true
3. More than 5 featured items (only top 5 shown)

**Fix:** Ensure content is verified and featured flag is enabled.

### 4.5 Checklist progress not saving

**Cause:** localStorage is cleared or blocked.

**Fix:** Check browser settings for localStorage access.

---

## 5. Monitoring

### 5.1 Vercel Analytics

Enable in Vercel dashboard for:
- Page views
- Web Vitals
- Error tracking

### 5.2 Supabase Dashboard

Monitor:
- Database size
- API requests
- Active connections
- Storage usage

### 5.3 Health Check

**GET** `/api/health`

Returns 200 if database is reachable.

---

## 6. Backup & Recovery

### 6.1 Database Backups

Supabase provides automatic daily backups on Pro plan.

**Manual backup:**
```bash
pg_dump $DATABASE_URL > backup.sql
```

### 6.2 Content Export

Export via SQL or Supabase dashboard exports.

---

## 7. Performance Optimization

### 7.1 Image Optimization

- Use `next/image` for all images
- Store images in Supabase Storage
- Use WebP format when possible
- Images served via CDN

### 7.2 Bundle Size

Run bundle analyzer:
```bash
ANALYZE=true npm run build
```

Target sizes:
- Homepage: < 150kb gzipped
- Reader: < 200kb gzipped

### 7.3 Caching

| Route | Cache Duration |
| --- | --- |
| `/` | 1 hour (ISR) |
| `/read/[id]` | 1 hour (ISR) |
| `/admin/*` | No cache |
| `/library`, `/notes`, `/ask` | Dynamic (No cache) |

---

## 8. Security & Production Hardening Checklist

- [x] Admin users are managed in Supabase Auth and `profiles.role = 'admin'` is tightly controlled
- [x] `SUPABASE_SERVICE_KEY` is not exposed to client
- [x] RLS policies are enabled on all tables
- [x] Markdown content is sanitized before rendering
- [x] Admin routes check session cookie
- [x] Image uploads validated for type and size
- [x] **Content Security Policy (CSP)** via Next.js middleware headers.
- [x] **API Rate Limiting** implemented on unprotected public routes and all admin APIs (e.g., upstash/ratelimit).
- [x] Graceful Error Boundaries configured network-wide (`error.tsx`).

---

## 9. Database Schema

### Tables

**content_item**
- `id` (UUID, PK)
- `type` (enum: podcast, book, article, video)
- `title` (TEXT)
- `author` (TEXT, nullable)
- `source_url` (TEXT, nullable)
- `cover_image_url` (TEXT, nullable)
- `hero_image_url` (TEXT, nullable)
- `audio_url` (TEXT, nullable)
- `category` (TEXT, nullable)
- `quick_mode_json` (JSONB, nullable)
- `status` (enum: draft, verified)
- `duration_seconds` (INTEGER, nullable)
- `is_featured` (BOOLEAN, default false)
- `embedding` (VECTOR, nullable)
- `created_at`, `updated_at`, `deleted_at`

**segment**
- `id` (UUID, PK)
- `item_id` (UUID, FK → content_item)
- `order_index` (INTEGER)
- `title` (TEXT, nullable)
- `markdown_body` (TEXT)
- `start_time_sec` (INTEGER, nullable)
- `end_time_sec` (INTEGER, nullable)
- `created_at`, `updated_at`, `deleted_at`

**segment_embedding**
- `id` (UUID, PK)
- `segment_id` (UUID, FK → segment)
- `content_item_id` (UUID, FK → content_item)
- `embedding` (VECTOR)
- `created_at`

**artifact**
- `id` (UUID, PK)
- `item_id` (UUID, FK → content_item)
- `type` (enum: checklist, plan, script)
- `payload_schema` (JSONB)
- `version` (TEXT, default '1.0.0')
- `created_at`, `updated_at`

**user_library**
- `user_id` (UUID, FK → profiles)
- `content_id` (UUID, FK → content_item)
- `is_bookmarked` (BOOLEAN)
- `progress` (JSONB)
- `last_interacted_at` (TIMESTAMP)

**user_highlights**
- `id` (UUID, PK)
- `user_id` (UUID, FK → profiles)
- `content_item_id` (UUID, FK → content_item)
- `segment_id` (UUID, FK → segment)
- `highlighted_text` (TEXT)
- `note_body` (TEXT, nullable)
- `color` (TEXT, nullable)
- `created_at`, `updated_at`

**reading_activity**
- `id` (UUID, PK)
- `user_id` (UUID, FK → profiles)
- `activity_date` (DATE)
- `duration_seconds` (INTEGER)
- `pages_read` (INTEGER)
- `created_at`, `updated_at`

---

## 10. Future Operations

When scaling, consider:

1. **CDN for images** — Move to Cloudflare or similar
2. **Analytics** — Add Plausible or Posthog
3. **Monitoring** — Add Sentry for error tracking
4. **Email** — Add Resend for newsletters
