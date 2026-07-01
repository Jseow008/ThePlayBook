# Client Boundary Policy

Status: Active.

Netflux uses Next.js App Router Server Components by default. Add `"use client"` only when the module needs browser-only behavior.

## Default Rule

- Keep data fetching, auth checks, route composition, and static presentation in Server Components.
- Push `"use client"` as far down the tree as practical.
- Pass serializable data from Server Components into small interactive islands.
- Keep design, layout structure, typography, spacing, and copy hierarchy aligned with `docs/DESIGN.md` and `app/globals.css`.

## Valid Reasons For `"use client"`

- Event handlers such as `onClick`, `onChange`, drag, swipe, or keyboard interaction.
- React client state, refs, effects, or layout measurements.
- Browser APIs such as `window`, `document`, `localStorage`, media queries, clipboard, Web Share, audio, or IntersectionObserver.
- Portals, dialogs, drawers, toasts, popovers, overlays, or focus traps.
- Client-only third-party libraries.

## Review Requirements

New client-marked files should be justified in code review. The justification can be short, but it should identify the interaction or browser API that requires the boundary.

Before adding a large client component, check whether the interactive part can be isolated behind a smaller child component or loaded with `next/dynamic`.

## Lazy Loading Guidance

Load optional UI on intent when practical:

- modal or lightbox internals
- AI sidebars and chat panels
- admin editors and drag-and-drop controls
- advanced carousel behavior
- reader drawers, audio controls, or secondary composers

Do not split components just to satisfy file-size optics. Use bundle analysis first, then split where it reduces initial route JavaScript or shared chunk pressure without changing the product experience.

## Local Checks

```bash
npm run check:client-boundaries
npm run analyze:ci
npm run check:bundle-budgets
```
