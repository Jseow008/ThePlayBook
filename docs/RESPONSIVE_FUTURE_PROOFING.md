# Netflux Responsive and Future-Proofing Audit

This document is the source of truth for responsive resilience and medium-term maintainability work. It is intentionally documentation-only: it does not replace the current Netflux design system, page structure, typography, spacing rhythm, or product identity.

Last updated: 2026-06-27
Last verified by codebase audit: 2026-06-27

## Operating Rules

- Treat `docs/DESIGN.md`, `app/globals.css`, and active components as the source of truth.
- Preserve the current landing page structure, app shell, reader model, notes workflow, and dark-first product identity unless a redesign is explicitly approved.
- Prefer shared primitives and test gates over one-off responsive patches.
- Every remediation should include verification: component test, Playwright viewport test, visual smoke test, performance budget, or lint/typecheck gate.
- Any future UI changes should be checked at mobile, tablet, laptop, and wide desktop sizes before shipping.

## Audit Scope

Reviewed repository scale (verified counts):

- 293 TypeScript/TSX files across `app`, `components`, `hooks`, and `lib`
- 102 client-marked files (`"use client"`)
- 29 App Router pages
- 48 API route handlers
- 52 component tests
- 9 Playwright e2e specs (desktop Chromium only)
- 128 total test files (unit + component + API + security + e2e)

Primary responsive surfaces reviewed:

- Landing page: `components/ui/LandingPage.tsx`, `components/ui/landing/*`, `app/globals.css`
- Public app shell: `components/ui/PublicLayoutShell.tsx`, `MobileHeader.tsx`, `MobileBottomNav.tsx`
- Browse/search/library cards and lanes: `HomeFeed.tsx`, `HeroCarousel.tsx`, `ContentLane.tsx`, `ContentCard.tsx`, `LibraryToolbar.tsx`
- Reader and notes: `ReaderView.tsx`, `ReaderHeroHeader.tsx`, `NotesDrawer.tsx`, `MobileNoteComposer.tsx`, `app/(public)/notes/client-page.tsx`
- Focus feed: `components/focus/FocusFeed.tsx`, `FocusCardView.tsx`, `focus-feed-layout.ts`
- Admin shell and content workflow: `app/admin/layout.tsx`, `app/admin/page.tsx`, `components/admin/*`
- Project guardrails: `next.config.ts`, `eslint.config.mjs`, `playwright.config.ts`, `vitest.config.ts`

## Baseline Strengths

- Netflux has an explicit design source of truth in `docs/DESIGN.md` and semantic tokens in `app/globals.css` (:root L14–56, @theme inline L170–199).
- The app already uses `next/font`, scoped reader themes (`.reader-light`, `.reader-sepia`, `.reader-dark`), constrained `next/image` remote patterns (10 domains in `next.config.ts`), safe-area padding in key mobile chrome, and `dvh`/`svh` in several immersive surfaces.
- Browse, landing, preview, read, and series pages use ISR or cacheable server rendering instead of fully client-only rendering.
- Several high-risk mobile interactions already have tests, especially Focus, Reader highlights, onboarding, shell chrome suppression, and library toolbar wrapping (52 component tests).
- Focus has dedicated layout math in `focus-feed-layout.ts`, which makes viewport-fit behavior testable instead of being buried entirely in Tailwind strings. It includes 4 desktop compact levels, mobile fit calculations, and minimum readable hook height constants.
- Public content data fetching often uses parallel requests, reducing obvious server waterfalls.
- Landing animations have thorough `prefers-reduced-motion: reduce` handling in `globals.css` (L495–499, L929–959, L1269–1321), covering hero drift, reveals, underlines, workflow connectors, CTA sheen, and landing card transitions.
- The storyboard lightbox in `LandingPageSections.tsx` (L1007–1069) implements a proper focus trap, Escape handling, arrow key navigation, scroll lock, and focus restoration.
- Security headers in `next.config.ts` are comprehensive: CSP, HSTS, X-Frame-Options DENY, Permissions-Policy, Referrer-Policy, and CORS on API routes.

## P0: Production Blockers

No P0 responsive or future-proofing blockers were found during this audit.

The current product has enough responsive treatment to continue development. The main risk is regression: as more surfaces are added, the lack of browser-level responsive gates and shared layout primitives will make failures harder to catch.

## P1: High Priority Before Broad Launch

### 1. Add a real responsive Playwright gate

Status: Implemented in `400d2c4`.

Implementation notes:

- Commit: `400d2c4` (`Add responsive chrome policy and viewport gates`).
- Playwright config: `playwright.config.ts` now defines responsive projects for `mobile-se` (375 × 667), `mobile-iphone` (390 × 844), `mobile-landscape` (667 × 375), `tablet-portrait` (768 × 1024), `tablet-landscape` (1024 × 768), and `desktop-chromium` (1440 × 900).
- NPM script: `package.json` includes `npm run test:e2e:responsive` so CI and local checks can run the responsive gate directly.
- Shared assertions: `tests/e2e/helpers/responsive.ts` centralizes the route health checks: document horizontal overflow, visible focus target, fixed chrome overlap, mobile header scroll states, critical console/page errors, guest onboarding bypass, and test auth helpers.
- Public route coverage: `tests/e2e/responsive-public.spec.ts` guards `/`, `/browse`, `/search`, `/requests`, `/focus`, plus dynamic `/preview/*` and `/read/*` routes.
- Authenticated route coverage: `tests/e2e/responsive-authenticated.spec.ts` guards `/notes`, `/ask`, and `/library/my-list`.
- Admin route coverage: `tests/e2e/responsive-admin.spec.ts` guards unauthenticated `/admin` redirect behavior plus authenticated `/admin` and `/admin/content` when responsive admin credentials are configured.
- Dynamic content strategy: `/preview/*` and `/read/*` use `RESPONSIVE_PREVIEW_PATH` and `RESPONSIVE_READ_PATH` when configured. If those variables are absent, the test discovers a preview link from `/browse`, reads the canonical `Read Summary` link when available, and falls back to `/read/<id>` for environments where the app redirect can canonicalize the slug.
- Production/CI note: for non-skippable dynamic route coverage in CI, configure stable public verified content paths via `RESPONSIVE_PREVIEW_PATH` and `RESPONSIVE_READ_PATH`. `RESPONSIVE_READ_PATH` also falls back to `SMOKE_READ_PATH`.
- Verification run before merge: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, focused desktop dynamic-route Playwright check, and `npm run test:e2e:responsive` all passed.
- Known limitation: WebKit/Safari projects were not added in this PR. That remains optional follow-up scope because the required viewport matrix is now covered in Chromium.

Issue: `playwright.config.ts` currently defines only one project: `chromium` using `devices['Desktop Chrome']` (L16–21). No mobile or tablet viewport projects exist. Component tests cover some mobile intent, but they do not prove rendered layout behavior in real mobile/tablet browser dimensions.

Required outcome:

- Add Playwright projects for mobile, tablet, desktop, and optionally WebKit.
- Cover representative routes: `/`, `/browse`, `/search`, `/preview/[id]`, `/read/[id]`, `/notes`, `/focus`, `/library/my-list`, `/requests`, and core admin pages.
- Assert no unintended horizontal document scroll, no fixed chrome covering primary actions, visible focus targets, and no critical console errors.

Suggested viewport matrix:

- 375 × 667 (iPhone SE)
- 390 × 844 (iPhone 14)
- 768 × 1024 (iPad portrait)
- 1024 × 768 (iPad landscape / small laptop)
- 1440 × 900 (desktop)

Acceptance criteria:

- CI fails if `document.documentElement.scrollWidth > window.innerWidth + 1` on guarded routes.
- Mobile bottom nav and sticky headers do not cover CTAs, composers, or pagination controls.
- `/focus` and `/ask` remain immersive and own the viewport without mobile header/bottom nav collisions.

### 2. Centralize mobile chrome and viewport sizing primitives

Status: Partially implemented in `400d2c4`; remaining page-level safe-area migration is still open.

Implementation notes:

- Commit: `400d2c4` (`Add responsive chrome policy and viewport gates`).
- Shared primitives: `app/globals.css` now declares `--mobile-header-height`, `--mobile-header-compact-height`, `--mobile-bottom-nav-height`, `--mobile-bottom-nav-compact-height`, `--safe-area-bottom`, `--safe-area-top`, and `--focus-mobile-vertical-chrome`.
- Shared utilities: `app/globals.css` now provides `.mobile-header-height`, `.mobile-header-compact-height`, `.mobile-bottom-nav-height`, `.mobile-bottom-nav-compact-height`, `.mobile-shell-bottom-padding`, and `.mobile-shell-bottom-padding-compact`.
- Shell policy map: `lib/route-chrome-policy.ts` defines typed route chrome policies using `satisfies RouteChromePolicy` for landing, browse, read, preview, ask, focus, and standard app pages.
- Shell refactor: `components/ui/PublicLayoutShell.tsx` now consumes `getRouteChromePolicy(pathname)` instead of duplicating route-specific chrome conditionals inline.
- Header/nav refactor: `components/ui/MobileHeader.tsx` and `components/ui/MobileBottomNav.tsx` consume shared height utilities. Test IDs were added to support browser-level chrome assertions.
- Focus viewport refactor: `components/focus/focus-feed-layout.ts` now uses shared CSS variables for mobile viewport sizing instead of embedding the old `3rem + 4rem + env(safe-area-inset-bottom)` calculation directly.
- Test corrections: `tests/components/PublicLayoutShell.test.tsx` was updated to match real shell behavior, including correcting the existing `/read/*` mock mismatch where the test previously hid `MobileHeader` even though production rendered it.
- Regression coverage: `tests/components/route-chrome-policy.test.ts` covers landing, browse, read, preview, ask, focus, default app routes, and `/notes` as a standard-policy anchor for the next safe-area migration.
- Related test updates: focus feed tests now assert the exported layout constants rather than hard-coded old class strings; mobile header tests assert the explicit transform state used for scroll hiding.
- Verification run before merge: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, focused desktop dynamic-route Playwright check, and `npm run test:e2e:responsive` all passed.
- Production behavior note: `/read/*` and `/preview/*` intentionally keep the mobile header and suppress the mobile bottom nav; `/ask` owns the viewport with no mobile chrome; `/focus` owns the viewport while retaining the bottom nav.

Remaining scope:

- Migrate the remaining inline `env(safe-area-inset-bottom)` usages listed below to shared utilities or component-level primitives.
- Revisit page-owned viewport surfaces after those migrations to remove redundant `min-h-screen` / fixed-padding patterns where appropriate.

Issue: There are many independent height, fixed-position, safe-area, and overflow patterns across the codebase.

Evidence of height/padding fragmentation:

| Component | Height | File:Line |
|-----------|--------|-----------|
| MobileHeader (default) | `h-14` | `MobileHeader.tsx:61` |
| MobileHeader (compact/browse) | `h-12` | `MobileHeader.tsx:61` |
| MobileBottomNav (default) | `h-16` | `MobileBottomNav.tsx:38` |
| MobileBottomNav (compact) | `h-14` | `MobileBottomNav.tsx:38` |
| Header spacer (default) | `h-14` | `PublicLayoutShell.tsx:77` |
| Header spacer (browse) | `h-12` | `PublicLayoutShell.tsx:77` |
| Bottom padding (default) | `4rem + safe-area` | `PublicLayoutShell.tsx:72` |
| Bottom padding (browse) | `3.5rem + safe-area` | `PublicLayoutShell.tsx:71` |
| Focus feed list height | `calc(100dvh-3rem-4rem-safe-area)` | `focus-feed-layout.ts:2` |

23 locations use `env(safe-area-inset-bottom)` inline across `app/` and `components/`, including: `PublicLayoutShell.tsx` (L71–72), `ContentPreview.tsx` (L99, L372), ask page (L358, L496, L558), notes page (L515), `AudioPlayer.tsx` (L402), `AuthorChat.tsx` (L355), `MobileNoteComposer.tsx` (L133), `MobileSelectionActions.tsx` (L199), `NotesDrawer.tsx` (L231–232), `ReaderSettingsMenu.tsx` (L263), `FocusTakeawaysSheet.tsx` (L142, L190), and the landing lightbox (L1165).

Risk:

- Fixed mobile header/bottom nav heights can drift from page padding.
- `min-h-screen` remains common on pages with fixed mobile chrome (7 locations found in components).
- New immersive routes may forget to opt out of mobile chrome.

Required outcome:

- Define shared shell constants or CSS custom properties for mobile header height, compact header height, bottom nav height, and safe-area offsets.
- Prefer `dvh`/`svh` utilities for viewport-owned surfaces.
- Add a small route chrome policy map for read, preview, ask, focus, landing, and standard app pages.

Acceptance criteria:

- App chrome heights are declared once.
- Pages consume shared padding/height utilities instead of repeating `calc(...env(safe-area-inset-bottom))`.
- Adding a new immersive route requires changing one policy map, not hand-editing shell conditionals.

### 3. Harmonize "isDesktop" breakpoint thresholds

Status: Open.

Issue: Three different pixel thresholds are used to distinguish mobile from desktop behavior. This creates edge cases where a device at 768px is "mobile" for the reader but "desktop" for the focus feed and "mobile" for the ask page.

Evidence:

| Threshold | Used by | File:Line |
|-----------|---------|-----------|
| 640px (`sm`) | `ReaderView.tsx` isDesktop | `ReaderView.tsx:105` |
| 640px (`sm`) | `SegmentAccordion.tsx` isDesktop | `SegmentAccordion.tsx:268` |
| 640px | `NotesDrawer.tsx` isMobile | `NotesDrawer.tsx:80` |
| 640px | `ReaderSettingsMenu.tsx` isMobile | `ReaderSettingsMenu.tsx:27` |
| 768px (`md`) | `FocusFeed.tsx` isDesktop | `FocusFeed.tsx:286` |
| 1024px (`lg`) | Ask page isDesktop | `ask/client-page.tsx:93` |
| 1024px | Notes client page | `notes/client-page.tsx:1052` |
| 767px (max-width) | Background scroll animation | `background-scroll-animation.tsx:35` |

Required outcome:

- Define a shared set of named breakpoint constants or a convention document.
- Decide whether "desktop" means `sm` (640px), `md` (768px), or `lg` (1024px) for layout-switching purposes, and apply consistently.
- Replace ad hoc `window.innerWidth` checks and direct `window.matchMedia` calls with the shared `useMediaQuery` hook where possible.

Acceptance criteria:

- No component uses a different definition of "desktop" without an explicit reason documented in code.
- A viewport at 768px behaves consistently across reader, focus, notes, and ask surfaces.

### 4. Create shared viewport, media query, and body-scroll-lock hooks

Status: Open.

Issue: Responsive behavior is implemented with several local patterns: `useMediaQuery`, direct `window.innerWidth` checks, local `matchMedia`, duplicated `resize` listeners, and repeated body/html overflow locks.

Evidence for scroll lock fragmentation (9+ independent implementations):

| Component | Pattern | File:Line |
|-----------|---------|-----------|
| Library completed dialog | `body.style.overflow` | `library/completed/page.tsx:135–152` |
| Notes editor overlay | `body` AND `documentElement` overflow | `notes/client-page.tsx:628–635` |
| ChatExportButton | `body.style.overflow` | `ChatExportButton.tsx:149–152` |
| FocusFeed takeaways | `body` AND `documentElement` overflow | `FocusFeed.tsx:1119–1127` |
| AuthorChat overlay | `body.style.overflow` | `AuthorChat.tsx:87–89` |
| MobileNoteComposer | `body` AND `documentElement` overflow | `MobileNoteComposer.tsx:58–66` |
| AppOnboardingTour | `body.style.overflow` | `AppOnboardingTour.tsx:67–71` |
| ContentFeedback dialog | `body.style.overflow` | `ContentFeedback.tsx:42–44` |
| Landing storyboard | `body.style.overflow` | `LandingPageSections.tsx:1010–1060` |

Note: several overlays lock both `document.body` and `document.documentElement`, while most lock only `body`. Because each implementation restores its own captured previous value, overlapping overlays can still restore scroll state out of order.

Evidence for `useMediaQuery` resubscription issue:

`hooks/useMediaQuery.ts` (L14) includes `matches` in the effect dependency array. This causes the `matchMedia` listener to unsubscribe and resubscribe whenever the match state changes, though the practical impact is low since `matchMedia` change events fire infrequently.

Evidence for `useMediaQuery` SSR hydration concern:

`hooks/useMediaQuery.ts` (L4) initializes with `useState(false)`. On SSR, all media queries are `false`, which may cause a layout flash on hydration when the real viewport matches. Components using this hook for layout decisions (e.g., isDesktop in `FocusFeed.tsx`, `ReaderView.tsx`) will render the mobile layout on the server and then switch to desktop on the client.

Required outcome:

- Replace ad hoc viewport checks with a shared `useMediaQuery` based on a stable subscription pattern (remove `matches` from effect deps).
- Add shared `useBodyScrollLock` with nested lock safety (reference count or Set-based tracking).
- Add shared reduced-motion and viewport-size helpers where layout measurement is required.
- Consider initializing `useMediaQuery` from server-side hints or from CSS media queries via `useSyncExternalStore` to reduce hydration flicker.

Acceptance criteria:

- No component needs direct `window.innerWidth < ...` for breakpoint state.
- Scroll locks compose correctly when drawers, sheets, and composers overlap.
- Event listeners do not resubscribe on every state transition.

### 5. Expand responsive regression tests around high-risk surfaces

Status: Open.

Issue: High-risk surfaces have good unit/component intent tests, but not enough browser-level checks for visual containment.

High-risk surfaces:

- Landing hero and featured reads carousel
- Browse hero/carousel and horizontal lanes
- Focus feed card fitting and mobile takeaways sheet
- Reader audio mini-player, notes drawer, text selection toolbar, and mobile note composer
- Notes page sticky filter bars and sidebar AI panel
- Admin content workbench filters and tables

Required outcome:

- Add a small suite of browser smoke tests that checks containment and primary interactions for these surfaces.
- Keep screenshots or DOM measurements focused; do not introduce broad flaky visual diffs.

Acceptance criteria:

- Tests prove scroll containers intentionally own horizontal scrolling while the document itself does not.
- Sticky/fixed elements remain reachable and do not hide the active input or CTA.
- Reader and notes overlays restore focus and scroll state after close.

### 6. Formalize a bundle and client-boundary budget

Status: Open.

Issue: The app has 102 client-marked files. Some large surfaces are necessarily interactive, but future growth will make bundle size and hydration cost harder to reason about.

Evidence:

- `LandingPageSections.tsx` is 50,442 bytes / 1,341 lines — contains carousel, modal, storyboard lightbox, drag/autoplay, and reveal behavior in one large client module.
- `FocusFeed.tsx` is 45,996 bytes with complex interaction state, measurements, and virtualization logic.
- `ReaderView.tsx` is 43,678 bytes with reading progress, highlights, audio player, and notes drawer integration.
- `NotesAskPanel.tsx` is 51,183 bytes with AI chat, note management, and sidebar state.
- Only 2 files use `next/dynamic` for code splitting: `components/ui/LandingPage.tsx` (L1) and `components/providers/AppToaster.tsx` (L3).
- Framer Motion (`framer-motion ^12.40.0`) is imported in only 1 file: `components/ui/background-scroll-animation.tsx` (L10). Its actual route impact should be confirmed with bundle analysis before assigning a size.

Required outcome:

- Add a documented client-boundary policy: server by default, client only for interaction islands.
- Run Next bundle analysis periodically and record route-level budgets. `@next/bundle-analyzer ^16.2.9` is already in devDependencies.
- Split heavy optional UI where it can load on intent: image modal, notes AI sidebar, admin editors, advanced carousels.

Acceptance criteria:

- A bundle analysis artifact exists before launch.
- Landing, browse, read, notes, and focus have tracked JS budgets.
- New client components justify the boundary in code review.

### 7. Tighten future type-safety gates

Status: Open.

Issue: TypeScript strict mode is enabled (`tsconfig.json` strict: true), but several future-proofing rules are relaxed globally in `eslint.config.mjs`:

| Rule | Status | File:Line |
|------|--------|-----------|
| `@typescript-eslint/no-explicit-any` | **`off` globally** | `eslint.config.mjs:10` |
| `@next/next/no-img-element` | **`off` globally** | `eslint.config.mjs:11` |
| `react-hooks/set-state-in-effect` | **`off`** | `eslint.config.mjs:12` |
| `react-hooks/static-components` | **`off`** | `eslint.config.mjs:13` |
| `react-hooks/purity` | **`off`** | `eslint.config.mjs:14` |

Re-enabled selectively for only 6 files (`eslint.config.mjs:18–29`): `app/api/library/**/*.ts`, `app/api/feedback/content/route.ts`, `app/api/activity/log/route.ts`, `app/api/random/route.ts`, `app/(public)/browse/page.tsx`, `hooks/useReaderSettings.ts`.

Evidence of `as any` spread:

- 28 production files across `app/`, `components/`, `hooks/`, and `lib/` contain `as any` casts.
- 19 production files in `app/` and `components/` contain `as any` casts.
- 7 files in `lib/server/` contain `as any` casts.
- Primary cause: Supabase generated types lagging schema — `(supabase as any).from(...)`, `(supabase as any).rpc(...)`.
- 3 `@ts-expect-error` directives exist, all for generated type lag:
  - `app/api/library/highlights/[id]/route.ts:111` — "types for user_highlights might be outdated"
  - `app/api/library/highlights/route.ts:95` — "types for user_highlights might be outdated"
  - `hooks/useReaderSettings.ts:265` — "generated profile types lag the schema additions"
- 0 `@ts-ignore` directives found (good).

Risk:

- Generated Supabase type drift is already leaking into app code through `as any` and `@ts-expect-error`.
- Future React/Next upgrades will be harder if hook purity and static component checks stay globally disabled.
- `@next/next/no-img-element` being disabled globally allows unoptimized `<img>` tags without lint warnings.

Required outcome:

- Keep exceptions where they are justified, but move toward file-scoped allowlists.
- Regenerate and commit database types after schema changes.
- Expand `no-explicit-any` enforcement from current 6 targeted files to server routes and shared libraries first.

Acceptance criteria:

- New app/API/library files cannot introduce `any` without an explicit local exception.
- Supabase type lag is tracked as schema maintenance, not normalized as permanent application code.
- React hook rule suppressions are reviewed and narrowed.

### 8. Centralize cache and revalidation policy

Status: Open.

Issue: ISR and `revalidatePath` are used, but cache strategy is distributed across pages and admin/API mutation routes with no tag-based invalidation.

Evidence of ISR durations:

| Route | Duration | File:Line |
|-------|----------|-----------|
| `/` | `revalidate = 3600` (1h) | `app/page.tsx:9` |
| `/browse` | `revalidate = 300` (5m) | `app/(public)/browse/page.tsx:24` |
| `/preview/[id]` | `revalidate = 300` (5m) | `app/(public)/preview/[id]/page.tsx:6` |
| `/read/[id]` | `revalidate = 300` (5m) | `app/(public)/read/[id]/[[...slug]]/page.tsx:13` |
| `/series/[slug]` | `revalidate = 300` (5m) | `app/(public)/series/[slug]/page.tsx:23` |

Evidence of `revalidatePath` fragmentation: **67 `revalidatePath` calls** spread across 13 `app/` and `lib/` files. Example duplication:

- `app/api/admin/content/[id]/route.ts` — PUT handler revalidates `/`, `/browse`, `/search`, `/admin`, `/admin/content`, `/preview/{id}`, `/read/{id}`, canonical read path, and series slugs (L591–606). DELETE handler repeats the same set (L720–731).
- `app/api/admin/content/bulk/route.ts` — revalidates the same paths per item in a loop (L73–86).
- `app/api/admin/content/route.ts` — POST handler duplicates the same revalidation pattern (L521+).

`revalidateTag` is not used anywhere (0 occurrences). All invalidation is path-based.

Required outcome:

- Create a single route revalidation helper for content mutations (e.g., `revalidateContentPaths(id, title, seriesSlugs)`).
- Document which pages are ISR, dynamic, request-time personalized, or client-personalized.
- Consider tag-based invalidation for content collections when the app is ready for that migration.

Acceptance criteria:

- Adding a new public content surface requires adding it to one revalidation helper or tag policy.
- Admin publish/edit/delete flows invalidate all relevant public pages consistently.
- Cache durations are documented by content freshness need, not copied per route.

## P2: Medium Priority Hardening

### 9. Standardize modal, drawer, and sheet behavior

Status: Open.

Issue: The project has multiple overlay implementations, and only 1 of 9+ overlays implements a focus trap.

Evidence of overlay focus trap coverage:

| Overlay | Focus Trap | Escape | Scroll Lock | aria-modal | Z-Index | File |
|---------|------------|--------|-------------|------------|---------|------|
| Landing storyboard lightbox | ✅ manual | ✅ | ✅ | ✅ | z-[100] | `LandingPageSections.tsx:1031–1054` |
| Library completed dialog | ❌ | ❌ | ✅ | ✅ | z-[120] | `library/completed/page.tsx` |
| ChatExportButton dialog | ❌ | ❌ | ✅ | ✅ | z-[120] | `ChatExportButton.tsx` |
| AppOnboardingTour | ❌ | ✅ | ✅ | ✅ | z-[120] | `AppOnboardingTour.tsx` |
| ReaderSettingsMenu (mobile sheet) | ❌ | ✅ | ❌ | ❌ | z-[101] | `ReaderSettingsMenu.tsx` |
| AuthorChat overlay | ❌ | ❌ | ✅ | ✅ | z-[100] | `AuthorChat.tsx` |
| ContentFeedback | ❌ | ❌ | ✅ | ✅ | z-[100] | `ContentFeedback.tsx` |
| MobileNoteComposer | ❌ | ✅ | ✅✅ (double) | ✅ | z-[61] | `MobileNoteComposer.tsx` |
| NotesDrawer | ❌ | ✅ | ❌ | ❌ | z-50 | `NotesDrawer.tsx` |
| FocusTakeawaysSheet | ❌ | ✅ | ✅ | ✅ | z-[80] | `FocusTakeawaysSheet.tsx` |
| Notes Ask Panel sheet | ❌ | ❌ | ✅ | ❌ | z-[70] | `notes/client-page.tsx` |

Evidence of z-index collision risk — 7 components share z-[100]:

- `AuthorChat.tsx:173`
- `HighlightPopover.tsx:142`
- `ContentFeedback.tsx:209`
- `ReaderSettingsMenu.tsx:260`
- `TextSelectionToolbar.tsx:189`
- `ReadingHeatmap.tsx:466`
- `LandingPageSections.tsx:1165`

While these are unlikely to all be open simultaneously, several reader-page overlays and popovers share the same layer value. `AuthorChat`, `ReaderSettingsMenu`, `HighlightPopover`, `ContentFeedback`, `TextSelectionToolbar`, and `ReadingHeatmap` tooltip can all exist in the reader feature area, so stacking order should be intentional rather than incidental.

Required outcome:

- Define shared overlay expectations: focus trap, Escape behavior, body scroll lock, safe-area padding, max height, close affordance, restore focus, z-index range.
- Keep visual styling local to preserve Netflux identity, but centralize interaction guarantees.
- Document a z-index scale (e.g., shell=40, drawers=50, sheets=60–80, dialogs=100–120).

### 10. Add a motion-reduction audit

Status: Open.

Issue: Some surfaces respect reduced motion well, while others lack coverage.

Evidence of good coverage:

- Landing page: Comprehensive `prefers-reduced-motion: reduce` block in `globals.css` (L1269–1321) covering 15+ classes including `.landing-reveal`, `.landing-hero-emphasis`, `.landing-hero-workflow-step`, `.landing-primary-cta`, `.landing-featured-read-*`, etc.
- Landing hero: `prefers-reduced-motion: no-preference` guard for hero drift, reveals, underlines, workflow connectors, CTA sheen (L929–959).
- Focus feed scroll cue: `prefers-reduced-motion: reduce` → `animation: none` (L495–499).
- Background scroll animation: Uses `useReducedMotion` from framer-motion.
- Focus feed: Uses `useMediaQuery("(prefers-reduced-motion: reduce)")` at `FocusFeed.tsx:287`.
- HeroCarousel: Uses `useMediaQuery("(prefers-reduced-motion: reduce)")` at `HeroCarousel.tsx:34` to disable auto-rotation.

Evidence of gaps:

- `.card-hover` class at `globals.css:507–509` applies `hover:-translate-y-1` with no `prefers-reduced-motion` guard.
- `.btn-active` class at `globals.css:512–514` applies `active:scale-95` with no `prefers-reduced-motion` guard.
- Transition classes in overlays (`transition-transform duration-300` on MobileHeader, NotesDrawer slide animations, ReaderSettingsMenu sheet) lack `motion-reduce` variants except for `AudioPlayer.tsx:403` and `LandingPageSections.tsx:1135,1224`.
- Hover-only discoverability: Content card bookmark/remove buttons use `lg:opacity-0 lg:group-hover:opacity-100` (`ContentCard.tsx:203,282`) — not discoverable on touch devices at lg breakpoint, though they are always visible below lg.

Required outcome:

- Ensure custom animations and scroll effects have `motion-reduce` or `prefers-reduced-motion` fallbacks.
- Avoid hover-only discoverability on touch-first interactions.

### 11. Create responsive content-card standards

Status: Open.

Issue: Content cards are central to browse, search, library, landing featured reads, and focus. They mostly behave well, but card widths, text clamps, overlay gradients, and image sizes are spread across multiple components.

Evidence of card sizing fragmentation:

| Surface | Card Width | File:Line |
|---------|-----------|-----------|
| ContentLane shelf | `w-[168px]` mobile, `md:w-[240px]` | `ContentLane.tsx:152` |
| ContentCard (shared) | Aspect ratio `aspect-[2/3]` | `ContentCard.tsx:155` |
| Landing featured (primary) | `10.75rem × 16.125rem` → `sm:13.125rem` → `md:15.5rem` | `globals.css:1145–1241` |
| Landing featured (support) | `9.5rem × 14.25rem` → `sm:11.625rem` → `md:13.375rem` | `globals.css:1154–1241` |
| Focus card | Dynamic cover width: 132/116/104/92px by compact level | `focus-feed-layout.ts:17–20` |

Required outcome:

- Document card size families: compact shelf card, catalog grid card, landing featured card, focus card, reader cover.
- Keep existing styling, but define reusable sizing constants or helper classes where repeated.

### 12. Strengthen admin responsive patterns

Status: Open.

Issue: Admin pages are functional and use wrapping filters, but they are more table/form dense than public pages. As admin workflows grow, mobile and tablet usability will regress unless table and editor patterns are standardized.

Evidence:

- Admin layout stacks nav vertically on mobile, row on lg: `flex flex-col gap-3 py-3 lg:h-16 lg:flex-row` (`app/admin/layout.tsx:34`).
- Dashboard cards: `grid grid-cols-1 gap-4 md:grid-cols-3` (`app/admin/page.tsx:122`).
- Admin uses a separate light theme: `min-h-screen bg-background text-foreground light` (`app/admin/layout.tsx:30`).
- No admin-specific Playwright tests exist for tablet or mobile viewports.

Required outcome:

- Document when admin data should use card layout, horizontal table scroll, or column hiding.
- Add at least one tablet-width admin Playwright smoke test for content filters and editor navigation.

### 13. Add route ownership and shell-behavior documentation

Status: Open.

Issue: Shell behavior is currently encoded in `PublicLayoutShell.tsx` conditionals (L20–83). This works now, but route growth will make it easy to forget whether a page wants mobile chrome, immersive viewport ownership, bottom padding, or desktop sidebar padding.

Current encoded behaviors in `PublicLayoutShell.tsx`:

| Route | Header | Bottom Nav | Sidebar Padding | Bottom Padding | Viewport Mode |
|-------|--------|-----------|-----------------|----------------|---------------|
| `/` (landing) | None | None | None | None | Standalone |
| `/browse` | Compact (h-12) | Compact (h-14) | `lg:pl-16` | `3.5rem + safe-area` | Standard |
| `/read/*` | Default (h-14) | None | `lg:pl-16` | Default | Reader-owned |
| `/preview/*` | Default (h-14) | None | `lg:pl-16` | Default | Preview-owned |
| `/ask` | None | None | `lg:pl-16` | None | Immersive |
| `/focus` | None | ✅ (via bottom nav) | `lg:pl-16` | None | `100dvh` immersive |
| Default pages | Default (h-14) | Default (h-16) | `lg:pl-16` | `4rem + safe-area` | Standard |

Required outcome:

- Add a small route matrix in docs or code (above serves as the initial version).
- Adding a new immersive route requires changing one policy map, not hand-editing shell conditionals.

### 14. Track dependency upgrade posture

Status: Open.

Issue: The app is on modern tooling. Future-proofing now depends on an explicit upgrade rhythm.

Current major versions:

| Dependency | Version | Notes |
|-----------|---------|-------|
| Next.js | `^16.2.9` | Latest major |
| React | `^19.2.5` | Latest major |
| TypeScript | `^5` | Current |
| Tailwind CSS | `^4` | Latest major |
| Sentry | `^10.60.0` | Current |
| Supabase JS | `^2.108.2` | Current |
| AI SDK | `^6.0.97` | Current |
| Playwright | `^1.49.1` | Current |
| Vitest | `^4.0.18` | Current |
| Framer Motion | `^12.40.0` | Used in 1 file only — evaluate replacing with CSS animations |
| Zustand | `^5.0.2` | Used in 1 file only (`hooks/useReaderSettings.ts`) |

Note: `stores/` directory is empty. The only Zustand store lives in `hooks/useReaderSettings.ts` (L4–5) using `create` with `persist` middleware. PostCSS is pinned to `8.5.10` via an override in `package.json`.

Required outcome:

- Maintain a short upgrade checklist for Next, React, Tailwind, Sentry, Supabase, AI SDK, and Playwright.
- Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` after framework upgrades.
- Use bundle and responsive smoke tests as part of the upgrade checklist.
- Evaluate whether framer-motion's single usage justifies the bundle cost or can be replaced with CSS scroll-driven animations.

### 15. Audit low-use and heavy dependencies

Status: Open.

Issue: Some production dependencies are heavy, native, or low-use. They are not necessarily unused, but they should be reviewed periodically so bundle/runtime cost remains intentional.

Known low-use or high-impact dependencies:

| Package | Bundle Impact | Used In | Consideration |
|---------|--------------|---------|---------------|
| `framer-motion ^12.40.0` | Estimate: sizable client dependency; confirm with bundle analyzer | `background-scroll-animation.tsx` only | Evaluate replacing with CSS scroll-linked or transform animations if bundle analysis shows meaningful route cost |
| `ffmpeg-static ^5.3.0` | Native binary/server trace impact | Narration audio processing (`next.config.ts`, `lib/server/ai-narration.ts`) | Required for server-side audio; keep out of client bundles and verify tracing stays route-scoped |
| `@dnd-kit/* (3 packages)` | Moderate client dependency; confirm with bundle analyzer | Admin content form and sortable segment components | Required for admin drag-and-drop; keep isolated to admin/editor routes |

## Recommended Verification Commands

Run after implementation work that touches responsive layout, app shell, or core UI:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright test
```

Add these before launch:

```bash
npx next experimental-analyze
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"
```

For the responsive Playwright gate, configure stable dynamic content paths in CI whenever possible:

- `RESPONSIVE_PREVIEW_PATH=/preview/<verified-content-id>`
- `RESPONSIVE_READ_PATH=/read/<verified-content-id>/<canonical-slug>`

Both paths should point to a public `verified` content item. The preview path can be copied from `/browse`; the read path can be copied from that preview page's `Read Summary` CTA. `RESPONSIVE_READ_PATH` falls back to `SMOKE_READ_PATH`, but setting the canonical read path directly avoids an extra redirect and keeps `/preview/*` and `/read/*` browser-level chrome checks from depending on route discovery.

## Suggested Implementation Order

1. Add Playwright mobile/tablet projects and document horizontal-overflow assertions.
2. Harmonize "isDesktop" breakpoint thresholds across all surfaces.
3. Centralize mobile chrome height and route shell policy.
4. Add shared viewport/media-query/body-scroll-lock hooks.
5. Add browser smoke tests for landing, browse, preview, read, notes, focus, and admin.
6. Run bundle analysis and set route-level client JS budgets.
7. Narrow lint rule exceptions and reduce `any` usage in server/shared code.
8. Centralize route revalidation for content mutations.
9. Standardize overlay focus trap, escape, and z-index behavior.

## Risk Acceptance

No responsive or future-proofing risk has been formally accepted yet.

If a P1 item is deferred, record:

- owner
- date
- reason
- affected routes
- revisit date
- temporary verification coverage
