# Netflux Route Shell Policy

This document defines which layout owns each route's chrome, viewport, and safe-area behavior. It preserves the shipped Netflux design system: dark-first public app shell, current mobile header and bottom navigation behavior, current landing structure, and the separate light admin shell.

## Source of Truth

- Public app chrome policy: `lib/route-chrome-policy.ts`
- Public shell renderer: `components/ui/PublicLayoutShell.tsx`
- Public route group wrapper: `app/(public)/layout.tsx`
- Admin shell: `app/admin/layout.tsx`
- Root standalone routes: route files outside `app/(public)` and `app/admin`

Routes under `app/(public)` are wrapped by `PublicLayoutShell` and consume `getRouteChromePolicy(pathname)`. Routes outside that group do not consume the public shell policy.

## Viewport Modes

| Mode | Shell meaning | Use when |
|------|---------------|----------|
| `standalone` | No public app chrome; the shell returns the route as-is. | A route needs to own its entire page, such as a landing or share/export surface. |
| `standard` | Normal document-flow app page with desktop sidebar padding, mobile header, mobile bottom nav, and safe-area bottom padding. | Most browse, search, library, notes, profile, settings, and static public pages. |
| `immersive` | The shell constrains the page to `100dvh` with hidden overflow; the route owns internal scrolling and viewport layout. | App-like experiences such as Ask and Focus. |
| `reader` | Reader-owned document flow with mobile header and no mobile bottom nav. | Full read routes where reader controls and content own vertical spacing. |
| `preview` | Preview-owned document flow with mobile header and no mobile bottom nav. | Preview routes where page-level CTA and preview spacing own bottom behavior. |

`reader` and `preview` are currently similar mechanically. They are kept separate because they describe different product surfaces and may diverge without renaming the policy.

## Routes Governed by `getRouteChromePolicy`

These routes live under `app/(public)` and are rendered by `PublicLayoutShell`.

| Route | Owner | Header | Bottom Nav | Sidebar Padding | Bottom Padding | Viewport Mode | Auth |
|-------|-------|--------|------------|-----------------|----------------|---------------|------|
| `/about` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Public |
| `/ask` | Public shell | None | None | `lg:pl-16` | None | `immersive` | Authenticated |
| `/browse` | Public shell | Compact | Compact | `lg:pl-16` | Compact safe-area | `standard` | Public |
| `/focus` | Public shell | None | Default | `lg:pl-16` | None | `immersive` | Public |
| `/library/completed` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Authenticated |
| `/library/my-list` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Authenticated |
| `/library/reading` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Authenticated |
| `/notes` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Authenticated |
| `/preview/*` | Public shell | Default | None | `lg:pl-16` | None | `preview` | Public |
| `/privacy` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Public |
| `/profile` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Authenticated |
| `/read/*` | Public shell | Default | None | `lg:pl-16` | None | `reader` | Public plus personalized reader state when signed in |
| `/requests` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Public |
| `/search` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Public |
| `/series/*` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Public |
| `/settings` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Authenticated |
| `/terms` | Public shell | Default | Default | `lg:pl-16` | Default safe-area | `standard` | Public |

## Standalone Routes Outside `PublicLayoutShell`

These routes do not use `getRouteChromePolicy` because they are outside `app/(public)`.

| Route | Owner | Shell behavior | Notes |
|-------|-------|----------------|-------|
| `/` | Root route | Standalone landing page | The landing page is outside `app/(public)`. `route-chrome-policy.ts` still includes `/` as a defensive standalone policy. |
| `/login` | Root route | Standalone auth page | No public app chrome. |
| `/admin-login` | Root route | Standalone admin auth page | No public app chrome. |
| `/chat-export/*` | Root route | Standalone export/share page | Lives at `app/chat-export/[id]`; it must not inherit mobile app chrome. |

## Admin Routes

Admin routes use `app/admin/layout.tsx`, not `PublicLayoutShell` or `getRouteChromePolicy`.

| Route | Owner | Shell behavior |
|-------|-------|----------------|
| `/admin` | Admin shell | Separate light admin shell |
| `/admin/requests` | Admin shell | Separate light admin shell |
| `/admin/content` | Admin shell | Separate light admin shell |
| `/admin/content/new` | Admin shell | Separate light admin shell |
| `/admin/content/*/edit` | Admin shell | Separate light admin shell |
| `/admin/sections` | Admin shell | Separate light admin shell |
| `/admin/series` | Admin shell | Separate light admin shell |
| `/admin/insights` | Admin shell | Separate light admin shell |

## New Route Checklist

1. If the route lives under `app/(public)`, decide whether the default `standard` policy is correct.
2. If a route under `app/(public)` needs no app chrome, add an explicit `standalone` policy entry. Do not rely on a route being visually standalone by omission.
3. If a route under `app/(public)` owns the viewport, add an explicit policy entry with `viewportMode: "immersive"` and document how it handles internal scrolling.
4. If a route is a reader-like or preview-like document surface, use `reader` or `preview` instead of `immersive`.
5. If a route belongs to admin, configure it in the admin shell or admin responsive docs, not in `route-chrome-policy.ts`.
6. Update this document, `tests/components/route-chrome-policy.test.ts`, and responsive Playwright coverage when a route's shell behavior changes.

`npm run lint` runs `scripts/check-route-shell-policy.mjs`, which fails when a public page route is missing from this document or when special policy routes are not documented.
