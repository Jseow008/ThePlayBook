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
- `Manrope`
  - landing-page-only UI and body text
- `Newsreader`
  - landing-page-only editorial headings and content titles
- `Instrument Serif`
  - landing-page-only hero headline

Tailwind font mappings in `app/globals.css`:

- `--font-sans: var(--font-inter)`
- `--font-brand: var(--font-outfit)`
- `--font-serif: var(--font-serif)`

The landing page scopes `Manrope`, `Newsreader`, and `Instrument Serif` through landing-specific CSS variables and classes. Do not apply those landing overrides to the authenticated/public app shell without an explicit typography redesign.

Do not revert documentation to the older “system serif / Georgia” description unless the implementation changes back.

## 3. Surface-Level Layouts

### 3.1 Landing Page

The current landing page is not the older streaming-style hero carousel page.

It now ships as a marketing/editorial composition with:

- sticky minimal header
- editorial hero
- core platform feature storytelling
- horizontally scrolling featured reads strip
- topic map / category section
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
