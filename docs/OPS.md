# OPS.md: Operational Workflows

> **Status:** Active  
> **Purpose:** Development, deployment, and maintenance procedures for Lifebook.

---

## 1. Development Workflow

### 1.1 Start Local Stack

**Prerequisites:** Docker must be running.

```bash
# 1. Start Supabase (runs local DB, Auth, Storage)
npx supabase start

# 2. Start Next.js development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

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
| `.env.local` | Local development (Next.js) |
| `.env.example` | Template for required vars |

**Required Variables:**
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
ADMIN_PASSWORD=your-secure-password
```

---

## 2. Deployment

### 2.1 Next.js App → Vercel

**Trigger:** Push to `main` branch.

**Build Command:** `next build`

**Environment Variables (Vercel):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `ADMIN_PASSWORD`

### 2.2 Database → Supabase

**Production Setup:**
1. Create project at [supabase.com](https://supabase.com)
2. Link local project: `npx supabase link --project-ref YOUR_REF`
3. Push migrations: `npx supabase db push`

### 2.3 Domain & SSL

Configured via Vercel dashboard. SSL is automatic.

---

## 3. Content Management

Content is managed via the admin panel.

### 3.1 Adding New Content

1. Go to `/admin-login` (enter password)
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

### 3.5 Bulk Imports (Optional)

For large imports, use SQL scripts via `supabase/seed.sql` and apply with `psql`.

### 3.6 Admin Session Flow

1. Admin visits `/admin-login` and submits the password form.
2. `/api/admin/login` validates against `ADMIN_PASSWORD`.
3. On success, server sets an httpOnly `admin_session` cookie (24h).
4. All `/admin/*` routes verify the cookie before rendering or mutating content.

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

**Cause:** `ADMIN_PASSWORD` env var not set or mismatched.

**Fix:** Check environment variables and restart the app.

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

---

## 8. Security Checklist

- [ ] `ADMIN_PASSWORD` is strong (20+ characters)
- [ ] `SUPABASE_SERVICE_KEY` is not exposed to client
- [ ] RLS policies are enabled on all tables
- [ ] Markdown content is sanitized before rendering
- [ ] Admin routes check session cookie
- [ ] Image uploads validated for type and size

---

## 9. Database Schema

### Tables

**content_item**
- `id` (UUID, PK)
- `type` (enum: podcast, book, article)
- `title` (TEXT)
- `author` (TEXT, nullable)
- `source_url` (TEXT, nullable)
- `cover_image_url` (TEXT, nullable)
- `category` (TEXT, nullable)
- `quick_mode_json` (JSONB, nullable)
- `status` (enum: draft, verified)
- `duration_seconds` (INTEGER, nullable)
- `is_featured` (BOOLEAN, default false)
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

**artifact**
- `id` (UUID, PK)
- `item_id` (UUID, FK → content_item)
- `type` (enum: checklist, plan, script)
- `payload_schema` (JSONB)
- `version` (TEXT, default '1.0.0')
- `created_at`, `updated_at`

---

## 10. Future Operations

When scaling, consider:

1. **CDN for images** — Move to Cloudflare or similar
2. **Search** — Add Meilisearch for full-text search
3. **Analytics** — Add Plausible or Posthog
4. **Monitoring** — Add Sentry for error tracking
5. **Email** — Add Resend for newsletters
