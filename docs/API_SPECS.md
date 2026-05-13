# API_SPECS.md: Netflux API Surface

> **Status:** Active  
> **Purpose:** Describe the route handlers that currently exist under `app/api`.

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

List query params:

- `content_item_id`
- `cursor`
- `limit`

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

## 4. Public Product APIs

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/content/batch` | `POST` | `public` | Fetch multiple verified content items by ID. |
| `/api/focus` | `GET` | `public` | Return randomized quick-mode-ready focus feed items. |
| `/api/recommendations` | `POST` | `public` | RPC-backed recommendations based on completed IDs. |
| `/api/health` | `GET` | `public` | Deployment readiness checker for env config and database reachability. |
| `/api/monitor/image-fallback` | `POST` | `public` | Diagnostic logging for image fallback events. |

### 4.1 `/api/content/batch`

```json
{
  "ids": ["uuid", "uuid"]
}
```

Returns a JSON array of verified content rows.

### 4.2 `/api/focus`

Query params:

- `limit` (1-12)
- `excludeIds` as comma-separated UUIDs

Returns shuffled focus-feed items whose `quick_mode_json` passes validation.

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

All admin routes are protected by session + role checks.

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
