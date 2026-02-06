# API_SPECS.md: Lifebook API Contracts

> **Status:** Active  
> **Purpose:** API definitions for public data fetching, admin content management, and exports.

---

## 1. Public Data Access

Public content is fetched directly from Supabase using the anon key with RLS policies. No custom API routes needed for reads.

### 1.1 Content List Query

```typescript
// Fetch verified content items
const { data } = await supabase
  .from('content_item')
  .select('id, title, author, type, category, cover_image_url, duration_seconds, quick_mode_json, is_featured')
  .eq('status', 'verified')
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
```

### 1.2 Featured Content Query

```typescript
// Fetch featured items for hero carousel
const { data } = await supabase
  .from('content_item')
  .select('*')
  .eq('status', 'verified')
  .eq('is_featured', true)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(5)
```

### 1.3 Content Detail Query

```typescript
// Fetch single item with segments and artifacts
const { data } = await supabase
  .from('content_item')
  .select(`
    *,
    segments:segment(id, order_index, title, markdown_body, start_time_sec, end_time_sec),
    artifacts:artifact(id, type, payload_schema, version)
  `)
  .eq('id', itemId)
  .eq('status', 'verified')
  .is('deleted_at', null)
  .order('order_index', { foreignTable: 'segment' })
  .single()
```

---

## 2. Admin API Endpoints

All admin endpoints require authentication via admin session cookie.

### 2.1 Admin Login

**POST** `/api/admin/login`

**Request Body:**
```typescript
z.object({
  password: z.string().min(1)
})
```

**Response (200 OK):**
```json
{
  "success": true
}
```
Sets httpOnly cookie: `admin_session`

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid password"
}
```

---

### 2.2 Admin Logout

**POST** `/api/admin/logout`

Clears the admin session cookie.

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### 2.3 Create Content

**POST** `/api/admin/content`

**Request Body:**
```typescript
z.object({
  title: z.string().min(1),
  author: z.string().optional(),
  type: z.enum(['podcast', 'book', 'article']),
  category: z.string().optional(),
  source_url: z.string().url().optional(),
  cover_image_url: z.string().url().optional(),
  duration_seconds: z.number().int().positive().optional(),
  is_featured: z.boolean().default(false),
  quick_mode_json: z.object({
    hook: z.string(),
    big_idea: z.string(),
    key_takeaways: z.array(z.string())
  }).optional(),
  status: z.enum(['draft', 'verified']).default('draft'),
  segments: z.array(z.object({
    order_index: z.number().int(),
    title: z.string().optional(),
    markdown_body: z.string(),
    start_time_sec: z.number().int().optional(),
    end_time_sec: z.number().int().optional()
  })),
  artifacts: z.array(z.object({
    type: z.enum(['checklist', 'plan', 'script']),
    payload_schema: z.object({
      title: z.string(),
      items: z.array(z.object({
        id: z.string(),
        label: z.string(),
        mandatory: z.boolean().default(false)
      }))
    })
  })).optional()
})
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "...",
    "status": "draft"
  }
}
```

---

### 2.4 Update Content

**PUT** `/api/admin/content/[id]`

**Request Body:** Same as create, all fields optional.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "updated_at": "ISO-timestamp"
  }
}
```

---

### 2.5 Delete Content

**DELETE** `/api/admin/content/[id]`

Performs soft delete (sets `deleted_at`).

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### 2.6 List All Content (Admin)

**GET** `/api/admin/content`

Returns all content including drafts and deleted items.

**Query Parameters:**
- `status`: Filter by status (draft, verified, deleted)
- `type`: Filter by content type
- `featured`: Filter by featured flag
- `limit`: Default 50
- `offset`: Default 0

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "...",
      "type": "podcast",
      "status": "verified",
      "is_featured": true,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 2.7 Toggle Featured Status

**PATCH** `/api/admin/content/[id]/featured`

Toggle the `is_featured` flag.

**Request Body:**
```typescript
z.object({
  is_featured: z.boolean()
})
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "is_featured": true
  }
}
```

---

### 2.8 Image Upload

**POST** `/api/admin/upload`

Upload an image to Supabase Storage.

**Request:** `multipart/form-data` with `file` field

**Response (200 OK):**
```json
{
  "success": true,
  "url": "https://..."
}
```

---

## 3. Response Standards

### 3.1 Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### 3.2 Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [ ... ]
  }
}
```

### 3.3 Error Codes

| Code | HTTP Status | Description |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `UNAUTHORIZED` | 401 | Missing or invalid admin session |
| `NOT_FOUND` | 404 | Resource not found |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 4. Security

### 4.1 Admin Authentication

- Password compared against `ADMIN_PASSWORD` env var
- Session stored in httpOnly cookie (24h expiry)
- Cookie name: `admin_session`

### 4.2 Input Validation

All inputs validated with Zod before processing.

### 4.3 Database Access

Admin endpoints use Supabase service role key for full access.
Public queries use anon key with RLS.

---

## 5. Type Definitions

```typescript
// /types/database.ts

export type ContentStatus = "draft" | "verified";
export type ContentType = "podcast" | "book" | "article";
export type ArtifactType = "checklist" | "plan" | "script";

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  author?: string;
  source_url?: string;
  cover_image_url?: string;
  category?: string;
  quick_mode_json?: QuickModeContent;
  status: ContentStatus;
  duration_seconds?: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface QuickModeContent {
  hook: string;
  big_idea: string;
  key_takeaways: string[];
}

export interface Segment {
  id: string;
  item_id: string;
  order_index: number;
  title?: string;
  markdown_body: string;
  start_time_sec?: number;
  end_time_sec?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Artifact {
  id: string;
  item_id: string;
  type: ArtifactType;
  payload_schema: ChecklistPayload | ScriptPayload;
  version: string;
  created_at: string;
  updated_at: string;
}

export interface ChecklistPayload {
  title: string;
  items: Array<{
    id: string;
    label: string;
    mandatory: boolean;
  }>;
}

export interface ContentItemWithSegments extends ContentItem {
  segments: Segment[];
  artifacts: Artifact[];
}
```
