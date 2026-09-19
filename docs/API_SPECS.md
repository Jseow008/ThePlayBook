# API_SPECS.md: Netflux API Surface

> **Status:** Active  
> **Purpose:** Describe the principal route handlers under `app/api`. Access/export, reflection, and search entries were reconciled against `6bfdb99` on 19 September 2026; this is not an exhaustive fresh audit of every endpoint.

The source handlers and their schemas own exact payloads. See [STATUS.md](STATUS.md) for unmerged work: the typed personal-retrieval candidate is held and its new chat contract is not documented as shipped here.

## 1. Conventions

Most modern routes use the shared API helpers in `lib/server/api.ts` and return:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "request_id": "uuid"
  }
}
```

Some older public endpoints still return simpler payloads or raw arrays. Treat the implementation as authoritative when those differ.

Auth tiers used below:

- `public`: no session required
- `auth`: authenticated user required
- `admin`: authenticated user with `profiles.role = 'admin'`
- `session`: verified authenticated account and live session for snapshot access
- `cron`: server credential; never a browser API

## 2. Chat APIs

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/chat` | `POST` | `auth` | Ask My Library. Uses library snapshot plus Gemini segment retrieval. |
| `/api/chat/notes` | `POST` | `auth` | Ask These Notes. Grounded only in highlight IDs currently in scope. |
| `/api/chat/author` | `POST` | `public` | Author-style chat over a single content item's segments. Guests have stricter limits. |

### 2.1 `/api/chat`

Request body:

```json
{
  "messages": [
    { "role": "user", "content": "What themes keep showing up in my library?" }
  ]
}
```

Notes:

- last message must be a user message
- authenticated only
- uses Gemini embeddings for retrieval, Haiku by default for generation, and Sonnet for synthesis/hybrid Ask My Library requests when `AI_COMPLEX_MODEL` is configured

### 2.2 `/api/chat/notes`

Request body:

```json
{
  "messages": [
    { "role": "user", "content": "What contradictions show up across these notes?" }
  ],
  "highlightIds": ["uuid"],
  "scopeLabel": "Search: discipline"
}
```

### 2.3 `/api/chat/author`

Request body:

```json
{
  "contentId": "uuid",
  "authorName": "Author Name",
  "contentTitle": "Content Title",
  "messages": [
    { "role": "user", "content": "What do you mean by discipline?" }
  ]
}
```

Legacy clients may still send `bookTitle`, but new clients should send `contentTitle`.

## 3. Authenticated User APIs

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/activity/log` | `POST` | `public` | Log reading time through Supabase RPCs for signed-in readers or anonymous content readers. |
| `/api/activity/history` | `GET` | `auth` | Fetch reading activity rows for a date range. |
| `/api/library/bookmarks` | `POST`, `DELETE` | `auth` | Add/remove a bookmarked item. |
| `/api/library/highlights` | `GET`, `POST` | `auth` | List or create highlights. |
| `/api/library/highlights/[id]` | `PATCH`, `DELETE` | `auth` | Update note body/color or delete a highlight. |
| `/api/library/reflections` | `GET`, `POST` | `auth` | List owned reflections or save one for a content item. |
| `/api/library/reflections/[id]` | `PATCH`, `DELETE` | `auth` | Edit reflection text or delete the owned reflection. |
| `/api/account-data/snapshots` | `POST` | `session` | Create/reconcile an idempotent snapshot operation. |
| `/api/account-data/snapshots/[snapshotId]` | `GET` | `session` | Resume lookup: return an existing verified export manifest, never create another export. |
| `/api/account-data/snapshots/[snapshotId]/[collection]` | `GET` | `session` | Read one authorized snapshot page. |
| `/api/account-data/user_library` | `GET` | `auth` | Live keyset-paginated library listing; separate from immutable export traversal. |
| `/api/account-data/user_library/mutation` | `POST` | `auth` | Commit a library mutation and return server revision/reset acknowledgment. |
| `/api/account-data/reset` | `POST` | `auth` | Reset account library data through the restricted worker. |
| `/api/feedback/content` | `GET`, `POST`, `DELETE` | `auth` for writes | Read/save/remove a user’s content feedback. |

### 3.1 Activity

`POST /api/activity/log`

Authenticated example:

```json
{
  "duration_seconds": 120,
  "content_id": "uuid"
}
```

Anonymous content-reading example:

```json
{
  "duration_seconds": 45,
  "content_id": "uuid",
  "visitor_id": "uuid"
}
```

Behavior:

- signed-in requests with `content_id` call the service-role `log_reading_activity_for_user` entrypoint
- signed-in requests without `content_id` call the service-role `increment_reading_activity_for_user` entrypoint
- anonymous requests require both `content_id` and `visitor_id`, then call the service-role `log_anonymous_reading_activity` entrypoint
- the server normalizes `activity_date` to the current UTC date instead of trusting a client-supplied day

`GET /api/activity/history?start=2026-03-01&end=2026-03-29`

Returns ordered `reading_activity` rows for the current user.

### 3.2 Bookmarks

Request body for both `POST` and `DELETE`:

```json
{
  "content_item_id": "uuid"
}
```

Delete behavior is intentionally conservative:

- if a row only exists for bookmarking, it can be deleted
- if the row also stores progress, the bookmark is cleared but the row is retained

### 3.3 Highlights

Create request:

```json
{
  "content_item_id": "uuid",
  "segment_id": "uuid",
  "highlighted_text": "Important passage",
  "note_body": "Why this matters",
  "color": "blue",
  "anchor_start": 10,
  "anchor_end": 42
}
```

List/search query params:

- `content_item_id`
- `q`: normalized search text, at most 160 characters
- `type`: `highlight` or `note`
- `color`
- `sort`: `oldest` or default `newest`
- `cursor`
- `limit`

The `search_user_highlights` RPC applies owner scope, query, and filters before pagination. Search failure is an error, not a successful empty result. This improves Notes search; it does not replace the existing chat request's `highlightIds` boundary. The [route schema](../app/api/library/highlights/route.ts) owns filter validation and limits.

Update request for `/api/library/highlights/[id]`:

```json
{
  "note_body": "Updated note",
  "color": "purple"
}
```

### 3.4 Feedback

`GET /api/feedback/content?contentId=<uuid>`

Returns:

```json
{
  "success": true,
  "data": { "status": "up" }
}
```

Write request:

```json
{
  "content_id": "uuid",
  "is_positive": true,
  "reason": "helpful",
  "details": "clear framing"
}
```

Delete request:

```json
{
  "content_id": "uuid"
}
```

### 3.5 Account-data access, export, and resume

`POST /api/account-data/snapshots` accepts optional `idempotencyKey` (UUID) and `collections`. Omitted collections default to the library-only snapshot. Complete export must explicitly request all entries in [the collection registry](../lib/account-data-snapshot-collections.ts): preferences, library, highlights, reflections, reading activity, feedback, submitted requests, votes, notification preferences, request notifications, and AI usage.

Responses distinguish `201 { state, manifest }` from `202 { state: "building", snapshotId }`. Failed creation returns an error; retries must follow the idempotency contract rather than assume a new snapshot was created. Full exports and library hydration use separate creation allowances.

`GET /api/account-data/snapshots/[snapshotId]` returns `{ manifest }` after ownership, resume-session, availability, reset, and expiry checks. It returns `401` without a verified session, `404` for a missing/inaccessible snapshot, or `410` for expiry/invalidation; the error details include `snapshot_error`. It is an export-resume lookup, not a generic poll that creates work. The browser may retain an opaque snapshot ID; it does not retain the exported payload for resume.

Page reads accept `cursor` and `limit` (default 100, valid range 1–200), returning `{ data, manifest, pageInfo: { hasNextPage, endCursor } }`. Cursors bind to the account, snapshot, and collection. Complete export traverses every collection/page and verifies the manifest before file creation. Normal token refresh preserves the same session; logout, account/session replacement, reset, authorization loss, and expiry invalidate or cancel resume/delivery.

The live-list route returns `{ data, pageInfo }` using its own cursor, with the same default/range for `limit`; it does not provide an immutable export boundary. Mutation requests contain `contentId`, `isBookmarked`, `progress`, `lastInteractedAt`, and `deleteIfEmpty`, returning `data.resetEpoch` and `data.libraryRevision`. Reset returns `data.resetEpoch` and `data.currentRevision`. These route acknowledgments are not a claim that every broader offline/conflict requirement is complete.

Sources: [snapshot creation](../app/api/account-data/snapshots/route.ts), [snapshot server](../lib/server/account-data-snapshots.ts), [session validation](../lib/server/account-data-snapshot-auth.ts), and [client export](../lib/account-data-export-client.ts). The [reviewed design](PHASE_1_ACCESS_PATH_DESIGN.md) owns acceptance obligations.

### 3.6 Reflections

`GET /api/library/reflections` returns `{ data }` for the authenticated owner, optionally filtered by `content_item_id`. This route is not a complete paginated export API; use snapshot traversal for complete export coverage.

`POST` accepts `content_item_id`, a nonblank `prompt` (up to 500 characters), and nonblank `reflection_text` (up to 1,000 characters). It upserts the account/content-item reflection. `PATCH /api/library/reflections/[id]` accepts `reflection_text`; `DELETE` removes the owned row. See [the collection handler](../app/api/library/reflections/route.ts) for the authoritative schema. Reflection CRUD does not establish typed reflection retrieval into chat.

## 4. Public Product APIs

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/content/batch` | `POST` | `public` | Fetch multiple verified content items by ID. |
| `/api/catalog/search` | `GET` | `public` | Indexed lexical catalog search with ranking, snippets, and signed pagination. |
| `/api/focus` | `POST` | `public` | Return personalized, quick-mode-ready focus feed items with a discovery fallback. |
| `/api/recommendations` | `POST` | `public` | RPC-backed recommendations based on completed IDs. |
| `/api/health` | `GET` | `public liveness`; detailed via `HEALTH_CHECK_SECRET` | Deployment health checker. Anonymous callers receive only process liveness and never trigger DB checks; detailed env/database readiness requires `Authorization: Bearer <HEALTH_CHECK_SECRET>` or `x-health-check-secret` and uses cached, fail-fast DB probes. |
| `/api/monitor/image-fallback` | `POST` | `public` | Diagnostic logging for image fallback events. |

### 4.1 `/api/content/batch`

```json
{
  "ids": ["uuid", "uuid"]
}
```

Returns a JSON array of verified content rows.

### 4.2 `/api/focus`

The app uses `POST` so personal reading context is not sent in URL query strings:

```json
{
  "limit": 6,
  "seed": "session-seed",
  "cursor": "optional-cursor",
  "excludeIds": ["uuid"],
  "completedIds": ["uuid"],
  "savedIds": ["uuid"]
}
```

`completedIds` and `savedIds` are capped at 12 each and are used only to retrieve semantically related, Focus-eligible content. A six-card batch aims for up to four personalized cards and reserves the remaining cards for the existing diverse discovery feed. Completed and already-shown IDs are excluded. If no history or semantic matches are available, the route returns the generic diversified feed.

The legacy `GET` variant remains available for generic callers and accepts `limit`, `excludeIds`, `cursor`, and `seed` as query parameters. It does not personalize results.

### 4.3 `/api/recommendations`

```json
{
  "seedIds": ["uuid"],
  "completedIds": ["uuid"],
  "excludeIds": ["uuid"],
  "matchCount": 6
}
```

`seedIds` drives recommendation retrieval. `completedIds` and `excludeIds` are excluded from the result set. If `seedIds` is omitted, the route falls back to `completedIds` for backward compatibility.

Returns the reranked result of the `match_recommendations` RPC.

### 4.4 `/api/catalog/search`

Accepts `q`, optional `category`, optional `type` (`book`, `podcast`, or `article` in the current route schema), and an opaque `cursor`. The server normalizes the query and returns:

```text
{ outcome: "results" | "no_results" | "input_empty", results, pageInfo: { nextCursor, previousCursor, page } }
```

Results carry relevance rank and a snippet with text plus highlight offsets; render the text safely, not as trusted HTML. Query/filter-bound keyset cursors reject incompatible or invalid traversal with `400`. Search failures return a retryable `503`, never `no_results`. The private search projection is refreshed transactionally with content changes; traversal is eventually consistent, not an export snapshot. This is lexical search with no AI-generation dependency.

Sources: [route validation](../app/api/catalog/search/route.ts) and [search implementation](../lib/server/catalog-search.ts).

## 5. Email Subscription APIs

Newsletter subscription is separate from authentication. Subscribing does not create a Netflux account, and signing in does not automatically subscribe a user.

### 5.1 `/api/email-subscriptions`

`POST` creates or reactivates an explicit weekly email subscription.

Request:

```json
{
  "email": "reader@example.com",
  "source": "landing_final_cta",
  "page_path": "/",
  "referrer": "https://example.com"
}
```

Behavior:

- validates email and source at runtime
- stores consent text/version with the subscription row
- creates `status = "subscribed"` rows for new emails
- re-subscribes existing emails by clearing `unsubscribed_at` and updating `subscribed_at`
- rate-limited through the shared production rate limiter

### 5.2 `/api/email-subscriptions/unsubscribe`

`GET` supports direct unsubscribe links for future email templates:

```text
/api/email-subscriptions/unsubscribe?token=<unsubscribe_token>
```

`POST` supports programmatic unsubscribe:

```json
{
  "token": "unsubscribe-token"
}
```

Behavior:

- sets `status = "unsubscribed"`
- sets `unsubscribed_at`
- returns success without requiring a user session

Required email-template rule: every future weekly email must embed the `GET` unsubscribe URL for that recipient. Email sending jobs must exclude rows where `status != "subscribed"`.

## 6. Admin APIs

`GET /api/admin/account-data-snapshots/process` is a `cron` maintenance route protected by the server credential. It reconciles expired operations/snapshots and prunes eligible records; route presence does not prove scheduled production execution. The reported maintenance failure remains deferred in [STATUS.md](STATUS.md#deferred-and-separately-open).

The admin routes in the table below are protected by session + role checks; the maintenance route above uses its separate cron credential.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/admin/content` | `GET`, `POST` | List or create content items. Verified rows include `ai_readiness`. |
| `/api/admin/content/[id]` | `GET`, `PUT`, `DELETE` | Fetch, update, or soft-delete content. Verified rows include `ai_readiness`. |
| `/api/admin/content/[id]/featured` | `PATCH` | Toggle featured status |
| `/api/admin/sections` | `GET`, `POST` | List or create homepage sections |
| `/api/admin/sections/[id]` | `PUT`, `DELETE` | Update or delete a homepage section |
| `/api/admin/series` | `GET`, `POST` | List or create content series |
| `/api/admin/series/[id]` | `PUT`, `DELETE` | Update or delete a series |
| `/api/admin/upload` | `POST` | Upload cover/media images to Supabase Storage |
| `/api/admin/upload-audio` | `POST` | Upload audio files to Supabase Storage |
| `/api/admin/logout` | `POST` | Sign out the active admin session |
| `/api/admin/launch-readiness` | `GET` | Admin-only launch validation summary for runtime, storage, and AI readiness |
| `/api/admin/embeddings/sync` | `GET`, `POST` | `GET` returns content embedding readiness plus the sync workflow. `POST` backfills content-level embeddings. |
| `/api/admin/embeddings/sync-segments` | `GET` | Return segment coverage, AI readiness, and local sync commands. |
| `/api/admin/embeddings/sync-segments` | `POST` | Disabled, responds `405` with local-command guidance |

### 6.1 Content Create / Update

Key fields used by both create and update payloads:

```json
{
  "title": "Title",
  "author": "Author",
  "type": "book",
  "category": "Personal Development",
  "source_url": "https://example.com",
  "cover_image_url": "https://...",
  "hero_image_url": "https://...",
  "audio_url": "https://...",
  "duration_seconds": 1800,
  "status": "verified",
  "is_featured": true,
  "quick_mode_json": {
    "hook": "Hook",
    "big_idea": "Big idea",
    "key_takeaways": ["One", "Two"]
  },
  "series_id": "uuid",
  "series_order": 1,
  "segments": [
    {
      "order_index": 0,
      "title": "Section",
      "markdown_body": "Markdown"
    }
  ],
  "artifacts": [
    {
      "type": "checklist",
      "payload_schema": {
        "title": "Checklist",
        "items": [
          { "id": "one", "label": "Item", "mandatory": true }
        ]
      }
    }
  ]
}
```

Implementation notes:

- checklist is the only artifact type currently accepted by the API
- create and update both validate series assignment consistency
- update uses the `admin_update_content_graph` RPC for the content/segment/artifact graph
- admin content list/detail responses include `ai_readiness` for verified items so the dashboard can show publish vs. AI-stale state

### 6.2 Homepage Sections

Section create/update fields:

```json
{
  "title": "Recommended in Business",
  "filter_type": "category",
  "filter_value": "Business",
  "order_index": 0,
  "is_active": true
}
```

Allowed `filter_type` values:

- `author`
- `category`
- `title`
- `featured`

### 6.3 Series

Create/update fields:

```json
{
  "title": "Matthew",
  "slug": "matthew",
  "description": "Optional description"
}
```

Delete safeguard:

- a series cannot be deleted while non-deleted content items still point at it

### 6.4 Uploads

`POST /api/admin/upload`

- multipart form-data with `file`
- accepts image uploads
- writes to the `media` bucket under `covers/`

`POST /api/admin/upload-audio`

- multipart form-data with `file`
- accepts `mp3`, `wav`, `m4a`
- writes to the `audio` bucket

### 6.5 Launch Readiness Surfaces

The admin UI consumes the readiness endpoints above in:

- `/admin`
- `/admin/content/[id]/edit`

Those screens render the AI readiness badge and the content/segment sync actions. Treat them as the operator panel for launch validation.
