# AGENT.md: Implementation Roadmap

> **Role:** Full-Stack Engineer  
> **Objective:** Build Lifebook MVP  
> **Definition of Done:** Founder can upload content via admin panel. Visitors can browse, read (Quick/Deep mode), track progress locally, and engage with interactive artifacts.

---

## Phase 1: Foundation (MVP)

### Step 0: Project Setup ✓

* [x] Initialize Next.js with TypeScript, Tailwind, App Router
* [x] Install dependencies (Supabase, Zustand, dnd-kit, etc.)
* [x] Configure environment variables
* [x] Set up Supabase project

---

### Step 1: Database Schema ✓

**Context:** Schema for content, segments, and artifacts.

* [x] **1.1 Migration: Content Tables**
  * Created `content_item` table with fields: id, type, title, author, source_url, cover_image_url, category, quick_mode_json, status (draft/verified), duration_seconds, is_featured, timestamps
  * Created `segment` table with fields: id, item_id, order_index, title, markdown_body, start_time_sec, end_time_sec
  * Created `artifact` table with fields: id, item_id, type (checklist/plan/script), payload_schema, version

* [x] **1.2 Migration: Indexes**
  * Index on `content_item(status, deleted_at)` for public queries
  * Index on `content_item(category)` for category filtering
  * Index on `segment(item_id, order_index)` for ordered reads
  * Index on `artifact(item_id)` for artifact fetching

* [x] **1.3 Migration: RLS Policies**
  * Enabled RLS on all tables
  * Public SELECT on `content_item` where `status = 'verified'` AND `deleted_at IS NULL`
  * Public SELECT on `segment` where parent item is verified
  * Public SELECT on `artifact` where parent item is verified
  * Service role has full access (for admin operations)

* [x] **1.4 Seed Data**
  * Added sample content items across different categories
  * Added segments for each item
  * Added example artifacts (checklists)
  * Variety: podcasts, books, articles

---

### Step 2: Public Pages ✓

**Context:** The main visitor experience.

* [x] **2.1 Home Page (`/`)**
  * Hero carousel with featured content (is_featured flag)
  * Netflix-style horizontal scroll content lanes
  * Category-based content organization
  * "New on Lifebook" lane for latest additions
  * ISR with 1-hour revalidation

* [x] **2.2 Reader Page (`/read/[id]`)**
  * Fetch content item with segments and artifacts
  * Quick Mode view (hook, big idea, key takeaways)
  * Deep Mode view (full segmented content)
  * Toggle between modes
  * Sidebar navigation for segments
  * Interactive artifacts (checklists with local progress)

* [x] **2.3 Category Lanes**
  * Dynamic category grouping on homepage
  * Ordered category display (Health, Fitness, Wealth, etc.)
  * Horizontal scrollable lanes

* [x] **2.4 Random Content (`/random`)**
  * Redirects to a random published content item

* [x] **2.5 Search (`/search`)**
  * Basic search functionality

---

### Step 3: Local Progress Tracking ✓

**Context:** Track reading and artifact progress without user accounts.

* [x] **3.1 Checklist Progress Store**
  * LocalStorage persistence for checklist item completion
  * Track checked items per artifact

* [x] **3.2 Reading Progress**
  * Track current segment while reading
  * Auto-scroll to last position when returning

* [x] **3.3 Progress UI**
  * Show progress indicators on cards
  * Checklist completion state persisted locally

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
  * Created `/admin-login` route with password protection
  * Compare against `ADMIN_PASSWORD` env var
  * Store session in httpOnly cookie

* [x] **5.2 Admin Dashboard**
  * List all content items (draft + verified)
  * Filter by status and featured flag
  * Pagination support
  * Quick stats and type icons

* [x] **5.3 Content Editor**
  * Form: title, author, type, category, source_url, cover_image
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

### Step 6: UI Polish ✓

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
  * Smooth transitions
  * Loading states with skeletons

---

## Phase 2: Enhancements (Post-MVP)

Future features to consider:

1. **PDF Export** — Download summaries as PDF
2. **User Accounts** — Optional accounts for cross-device sync
3. **Comments** — Discussion section on content
4. **Newsletter** — Email signup for new content
5. **Analytics** — View counts, popular content
6. **AI Assistance** — Help generate summaries from transcripts
7. **Full-text Search** — Meilisearch integration

---

## Agent Instructions

1. **Read Context**: Before implementing, review the relevant section above.
2. **Type Safety**: Use TypeScript strict mode. No `any` types.
3. **Validation**: Use Zod for all form inputs.
4. **Sanitization**: Sanitize markdown before rendering.
5. **Progressive Enhancement**: Core reading works without JavaScript.
