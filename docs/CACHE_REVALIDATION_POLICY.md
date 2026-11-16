# Netflux Cache and Revalidation Policy

Status: Active
Last updated: 2026-11-16

This document records the current cache strategy. It does not change route structure, UI behavior, or public page freshness requirements.

## Public Route Freshness

| Surface | Cache Mode | Freshness |
| --- | --- | --- |
| `/` | ISR route segment | `revalidate = 3600` |
| `/browse` | ISR route segment | `revalidate = 300` |
| `/preview/[id]` | ISR route segment | `revalidate = 300` |
| `/read/[id]/[[...slug]]` | dynamic render (query parameters), shared public data cache | public data max 60 seconds; mutation invalidation below |
| `/series/[slug]` | ISR route segment | `revalidate = 300` |
| Authenticated library, notes, settings, activity | request/client personalized | not public ISR content |
| Admin routes | admin/request-time data | not public ISR content |

Keep route segment `revalidate` values as static numeric exports. Next.js route segment config should remain statically analyzable.

## Revalidation Helper

Content-item and public-content invalidation is centralized in `lib/server/revalidation.ts`.

Use the mutation-specific helpers instead of importing `revalidatePath` directly in content mutation routes:

- `revalidateContentCreated`
- `revalidateContentUpdated`
- `revalidateContentDeleted`
- `revalidateContentBulkChanged`
- `revalidateContentFeaturedChanged`
- `revalidateNarrationContentChanged`
- `revalidateSeriesAdminSurfaces`

Lower-level helper functions may be reused when a mutation has a narrower scope, but route handlers should not rebuild public content path lists locally.

## Mutation Scopes

### Content Create

Invalidates:

- public content collections: `/`, `/browse`, `/search`
- admin content list surfaces: `/admin`, `/admin/content`
- new public item paths: `/preview/:id`, `/read/:id`, `/read/:id/:slug`
- affected series pages

Does not invalidate `/admin/content/:id/edit`; the edit page is not a stale pre-existing page on first create.

### Content Update

Invalidates:

- public content collections
- admin content list surfaces
- public item paths
- old and new canonical read slug paths when the title changes
- `/admin/content/:id/edit`
- affected old and new series pages

### Content Delete

Invalidates:

- public content collections
- admin content list surfaces
- public item paths, including the canonical read slug when known
- affected series pages

Does not invalidate `/admin/content/:id/edit`; soft-deleted items should not keep a useful edit page cache.

### Featured Toggle

Invalidates:

- `/`
- `/browse`
- `/admin`
- `/admin/content`
- `/admin/content/:id/edit`

Featured changes are intentionally narrower than full content mutations. They affect landing/browse ordering and admin state, but do not change preview/read body content.

### Narration Changes

Invalidates:

- public content collections
- admin content list surfaces
- public item paths
- canonical read slug path when the title is available
- `/admin/content/:id/edit`

Narration completion changes reader/audio state, so read paths and admin edit pages must refresh. State-only narration resets may only know ids; those still invalidate id-based read and preview paths.

### Series Changes

Invalidates:

- `/admin/series`
- `/admin/content/new`
- affected `/series/:slug` pages

Series reassignment on content items is handled by the content mutation helpers because it affects public item and collection surfaces too.

## Direct `revalidatePath` Exceptions

Direct `revalidatePath` imports are allowed only for routes or actions that do not mutate `content_item` public content surfaces:

- `lib/actions/auth.ts`
- `app/admin/requests/actions.ts`
- `app/api/admin/sections/route.ts`
- `app/api/admin/sections/[id]/route.ts`
- `lib/server/revalidation.ts`

The boundary is enforced by `scripts/check-revalidation-boundaries.mjs`.

## Tag-Based Invalidation

Tag ownership is centralized in `lib/server/revalidation.ts`:

- `search-catalog-v1`: public Search/catalog and batch-card data. Helpers that invalidate `/search` hard-expire this tag.
- `public-reader-v1`: public Reader content, active segments, artifact templates, reading revision, timestamps and series context. Content create/update/delete/bulk/narration/replacement changes, and series metadata/path changes hard-expire this tag with `{ expire: 0 }`. The shared tag covers neighboring titles, publication state and series counts, including Readers other than the edited item. Featured-only ordering changes do not change Reader data.

Reader uses the cookie-free anonymous Supabase client and an explicit public projection. Sessions, progress, bookmarks, highlights and notes are never shared-cache inputs or values. The cache key includes the Supabase project URL and normalized content UUID, not query parameters or cookies. React render-local memoization still deduplicates metadata and page reads.

The 60-second Reader data boundary is enforced in the foreground even when Next returns a stale entry while starting background revalidation. Readers wait for that existing refresh, including its failure. Valid missing/unpublished/deleted results may be cached within the same bound and are cleared on publishing. Database failures and incomplete series reads are not cached as missing or degraded content. External writers that bypass application invalidation have a maximum 60-second data age; the first request after expiry blocks for a fresh read. Application publishing, withdrawal, deletion and replacement invalidate immediately after success. In-flight pages and already-rendered tabs are not live-updated by server cache invalidation.
