# DESIGN.md: Netflux Design Notes

> **Status:** Active  
> **Brand Identity:** For overarching, platform-agnostic branding rules (Mobile, Social Media), see [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md).
> **Constraint:** The shipped source of truth for the **Web App** is the current app implementation, especially `app/globals.css` and existing components.

## 1. Design System Baseline

Netflux is dark-first at the product-shell level, with reader-specific theme overrides inside the reading experience.

Core tokens live in `app/globals.css` and are exposed through semantic CSS variables:

- `--background`
- `--foreground`
- `--card`
- `--border`
- `--primary`
- `--muted`
- reader-specific text variables and theme overrides

The main app shell renders with the dark theme by default.

## 2. Typography

Current font stack:

- `Inter`
  - primary UI and general body text
- `Outfit`
  - brand/logo usage
- `Playfair Display`
  - serif/editorial display usage
- `Instrument Serif`
  - landing-page-only hero headline

Tailwind font mappings in `app/globals.css`:

- `--font-sans: var(--font-inter)`
- `--font-brand: var(--font-outfit)`
- `--font-serif: var(--font-serif)`

The landing page uses the global `Inter` and `Playfair Display` typography mappings, with `Instrument Serif` scoped only to the landing hero headline. Do not apply the hero override to the authenticated/public app shell without an explicit typography redesign.

Do not revert documentation to the older “system serif / Georgia” description unless the implementation changes back.

## 3. Surface-Level Layouts

### 3.1 Landing Page

The current landing page is not the older streaming-style hero carousel page.

It now ships as a marketing/editorial composition with:

- sticky minimal header
- editorial hero
- core platform feature storytelling
- horizontally scrolling featured reads strip with compact domain filters
- final CTA

Landing positioning should preserve Netflux as a summary-first knowledge system: summaries are the front door, while the retention layer is library, highlights, saved ideas, search, and AI retrieval. Do not reduce the page to a generic "read less" or summary-app pitch.

Primary source: `components/ui/LandingPage.tsx`

### 3.2 App Shell

The authenticated/public app shell outside `/` still uses:

- left sidebar on desktop
- mobile header
- mobile bottom navigation
- ambient background

Primary source: `components/ui/PublicLayoutShell.tsx`

### 3.3 Browse Feed

`/browse` is still the closest thing to the horizontal content-row app experience:

- featured content
- horizontally organized sections
- configurable homepage lanes from `homepage_section`

### 3.4 Responsive Content Cards

Content cards use a consistent 2:3 cover/card ratio across public discovery, reader context, and focus surfaces. Keep sizing changes local to the relevant family instead of copying one surface's dimensions into another.

| Family | Surfaces | Sizing Standard | Notes |
|--------|----------|-----------------|-------|
| Compact shelf card | Browse lanes, horizontal app shelves | `176px` mobile, `240px` from `md` | Loading skeletons for browse/public route transitions should match this family unless a different real card is being represented. |
| Catalog grid card | Shared `ContentCard` in search, library, browse lanes | 2:3 full-width card within the parent grid/shelf track | Text stays clamped inside the overlay; actions remain discoverable without hover-only opacity requirements. |
| Landing featured card | Landing featured reads strip | Primary: `10.75rem x 16.125rem`, `13.125rem x 19.7rem` at `sm`, `15.5rem x 23rem` at `md`; support: `9.5rem x 14.25rem`, `11.625rem x 17.45rem` at `sm`, `13.375rem x 19.75rem` at `md` | Keep this family in landing CSS custom properties because the carousel uses separate primary/support rows and landing-specific motion treatment. |
| Focus card cover | Focus feed | Desktop cover widths are `132px`, `116px`, `104px`, and `92px` by compact level; mobile uses `96px/112px` compact and `112px/124px` default | Preserve `getDesktopCoverWidth()` as the behavior API because it factors viewport height and compact level. |
| Reader cover | Preview and reader hero | `140px` below `sm`, then `192px` at `sm`, `224px` at `md` | Image `sizes` hints should match these rendered widths to avoid oversized mobile image requests. |

Implementation source: `components/ui/content-card-standards.ts`, with focus-specific cover widths in `components/focus/focus-feed-layout.ts`.

## 4. Reader Experience

### 4.1 Current Reader Layout

The live reader is a single-column accordion reader across desktop and mobile.

It includes:

- hero/header context
- sequential expandable segments
- highlights and notes interactions
- feedback controls
- completion state
- notes drawer

Primary source: `components/reader/ReaderView.tsx`

### 4.2 Reader Themes

Reader-specific themes currently supported:

- `reader-dark`
- `reader-light`
- `reader-sepia`

These are scoped theme overrides and should be documented separately from the browse shell.

### 4.3 Reader Controls

Reader settings currently include:

- theme
- font family
- font size
- line height / reading spacing

## 5. Notes and Knowledge Workflows

The notes experience is broader than a simple saved-highlights list.

Current `/notes` behavior includes:

- search across notes, highlights, content items, and sections
- filter controls for content item, type, color, and sort
- removable filter chips
- scoped “Ask These Notes” assistant grounded only in the current note scope
- deep links back into `/read/[id]?highlightId=...`

Primary sources:

- `app/(public)/notes/client-page.tsx`
- `components/notes/NotesAskPanel.tsx`

## 6. Motion and Interaction

The product uses restrained motion and transition polish rather than heavy animated choreography.

Common patterns:

- fade-in reveals on landing sections
- subtle hover translation and shadow changes
- sticky surfaces with backdrop blur
- toast feedback via `sonner`

## 7. Source-of-Truth Rules

When docs and artifacts disagree, prefer:

1. `app/globals.css`
2. active components in `components/ui`, `components/reader`, and `components/notes`
3. this file

`design-system/netflux/*` should be treated as reference-only material for assistants and design exploration, not as the live product design authority.
