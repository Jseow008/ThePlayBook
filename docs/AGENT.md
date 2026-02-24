# AGENT.md: Implementation Roadmap

> **Role:** Full-Stack Engineer  
> **Objective:** Build Flux MVP  
> **Definition of Done:** Founder can upload content via admin panel. Visitors can browse, read (Quick/Deep mode), track progress locally, and engage with interactive artifacts. Users can sign in to sync their library, save highlights, take notes, ask AI questions about content, and track their reading heatmap.

---

## Phase 1: Foundation (MVP)

### Step 0: Project Setup ✓

* [x] Initialize Next.js with TypeScript, Tailwind, App Router
* [x] Install dependencies (Supabase, Zustand, dnd-kit, etc.)
* [x] Configure environment variables
* [x] Set up Supabase project (hosted on Supabase Cloud)
* [x] Configure Supabase Auth for user authentication
* [x] Configure Supabase Storage for image uploads
* [x] Configure Google OAuth with custom domain
* [x] Setup robust Error and Loading boundaries
* [x] Apply Content Security Policy (CSP) and API Rate Limiting

---

### Step 1: Database Schema ✓

**Context:** Schema for content, segments, artifacts, user data, and AI features.

* [x] **1.1 Migration: Content Tables**
  * Created `content_item` table with fields: id, type, title, author, source_url, cover_image_url, hero_image_url, audio_url, category, quick_mode_json, status (draft/verified), duration_seconds, is_featured, timestamps, embedding
  * Created `segment` table with fields: id, item_id, order_index, title, markdown_body, start_time_sec, end_time_sec
  * Created `artifact` table with fields: id, item_id, type (checklist/plan/script), payload_schema, version

* [x] **1.2 Migration: User Data & AI Tables**
  * Created `profiles` table to manage user roles
  * Created `user_library`, `user_highlights`, and `reading_activity` for user engagement tracking
  * Created `segment_embedding` and `content_feedback` for AI features
  * Enabled pgvector extension for similarity search

* [x] **1.3 Migration: Indexes**
  * Index on `content_item(status, deleted_at)` for public queries
  * Index on `content_item(category)` for category filtering
  * Index on `segment(item_id, order_index)` for ordered reads
  * Index on `artifact(item_id)` for artifact fetching
  * HNSW index on `segment_embedding(embedding)` for fast vector search

* [x] **1.4 Migration: RLS Policies**
  * Enabled RLS on all tables
  * Public SELECT on `content_item` where `status = 'verified'` AND `deleted_at IS NULL`
  * Public SELECT on `segment` where parent item is verified
  * Authenticated users can manage their own library, highlights, notes, and reading activity
  * Service role has full access (for admin operations)

* [x] **1.5 Seed Data**
  * Added sample content items across different categories
  * Variety: podcasts, books, articles, video

---

### Step 2: Public Pages ✓

**Context:** The main visitor experience.

* [x] **2.1 Home Page (`/`)**
  * Hero carousel with featured content (is_featured flag)
  * Netflix-style horizontal scroll content lanes
  * Dynamic Homepage Section ordering
  * "New on Flux" lane for latest additions
  * ISR with 1-hour revalidation

* [x] **2.2 Reader Page (`/read/[id]`)**
  * Fetch content item with segments and artifacts
  * Quick Mode view (hook, big idea, key takeaways)
  * Deep Mode view (full segmented content)
  * Toggle between modes
  * Sidebar navigation for segments
  * Interactive artifacts (checklists)
  * Floating action menu (Share, Ask AI, Add to Library)

* [x] **2.3 User Interactions**
  * Universal Share Button / OS native share sheet
  * Dynamic Open Graph (OG) cards for social media
  * PWA App Manifest compatibility
  * Highlighting functionality with tooltips

* [x] **2.4 Search & AI (`/search` & `/ask`)**
  * Basic semantic search functionality
  * AI Chat interface for content Q&A
  * Integration with LLMs & pgvector embeddings

---

### Step 3: Authenticated User Experience ✓

**Context:** The personalized experience for signed-in users.

* [x] **3.1 My Library (`/library`)**
  * View bookmarked content items
  * Resume reading progress across devices

* [x] **3.2 Notes / Second Brain (`/notes`)**
  * Manage saved text highlights and user-created notes
  * Sortable and color-coded note entries

* [x] **3.3 Reading Activity & Heatmap**
  * Track reading sessions locally with a 60s minimum threshold before atomic database saves on tab blur/close to optimize serverless usage.
  * Visualize activity frequency with a GitHub-style heatmap on the Settings page

---

### Step 4: Artifacts System ✓

**Context:** Interactive utilities attached to content items.

* [x] **4.1 Artifact Types**
  * Checklist: List of items with mandatory flags
  * Plan: Structured action items (future)
  * Script: Fill-in-the-blank templates (future)

* [x] **4.2 Checklist Display**
  * Interactive checkboxes in reader view
  * Progress persistence to localStorage
  * Visual indicators for mandatory items

* [x] **4.3 Artifact Editor (Admin)**
  * Create/edit checklists attached to content
  * Add/remove items with labels
  * Set mandatory flags

---

### Step 5: Admin Panel ✓

**Context:** Protected interface for founder to manage content.

* [x] **5.1 Admin Auth**
  * Created `/admin-login` route with Supabase Auth sign-in
  * Verify admin role using `profiles.role = 'admin'`
  * Protect admin routes and APIs with server-side session checks

* [x] **5.2 Admin Dashboard**
  * List all content items (draft + verified)
  * Filter by status and featured flag
  * Generative AI batch processing
  * Vector embedding synchronization utilities

* [x] **5.3 Content Editor**
  * Form: title, author, type, category, source_url, cover_image, hero_image, audio
  * Quick Mode editor (hook, big idea, takeaways)
  * Segment editor with drag-and-drop reordering
  * Artifact editor (checklist items)
  * Markdown preview for segment content
  * Image upload to Supabase Storage

* [x] **5.4 Content Actions**
  * Save as Draft / Publish (Verify)
  * Edit existing content
  * Soft delete
  * Toggle featured status

---

### Step 6: UI Polish & Hardening ✓

* [x] **6.1 Netflix-Style Design**
  * Dark mode native theme
  * Hero carousel with gradient overlays
  * Content cards with hover effects
  * Glassmorphism sidebar

* [x] **6.2 Responsive Design**
  * Mobile, tablet, desktop layouts
  * Collapsible sidebar on mobile
  * Touch-friendly navigation

* [x] **6.3 Micro-interactions**
  * Card hover animations
  * Toast notifications for feedback
  * Smooth transitions and popovers
  * Loading states with UI-consistent skeletons

---

## Phase 2: Future Enhancements (Post-MVP)

Future features to consider:

1. **PDF Export** — Download summaries as PDF
2. **Comments** — Discussion section on content
3. **Newsletter** — Email signup for new content

---

## Agent Instructions

1. **Read Context**: Before implementing, review the relevant section above.
2. **Type Safety**: Use TypeScript strict mode. No `any` types.
3. **Validation**: Use Zod for all form inputs.
4. **Sanitization**: Sanitize markdown before rendering.
5. **Progressive Enhancement**: Core reading works without JavaScript.
