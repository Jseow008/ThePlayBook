# Dependency Isolation Audit

Generated: 2026-07-02.

Command:

```bash
npm run analyze:ci
npm run check:bundle-budgets
npm run check:client-boundaries
npm run check:dependency-isolation
```

Analyzer note: `npm run analyze:ci` intentionally uses `next build --webpack`. The local webpack bundle analyzer reports under `.next/analyze/` are ignored; this document records the durable findings.

## Policy

Low-use and heavy dependencies are allowed only when their route impact is intentional:

- `framer-motion` must remain isolated to the landing background scroll component.
- `@dnd-kit/*` must remain isolated to admin-only content editing surfaces.
- `ffmpeg-static` must stay out of client bundles and remain scoped to server-side admin/narration traces.

The static enforcement gate is `npm run check:dependency-isolation`, which is part of `npm run lint`.

## Current Measurements

Client bundle measurements come from `.next/analyze/client.html`.

| Dependency | Current scope | Stat size | Parsed size | Gzip size | Entrypoints | Decision |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `framer-motion` family (`framer-motion`, `motion-dom`, `motion-utils`) | `components/ui/background-scroll-animation.tsx` only | 487.2 KiB | 129.7 KiB | 47.3 KiB | `app/page` | Keep for now; close to replacement threshold, so keep isolated. |
| `@dnd-kit/*` | Admin content form/editor only | 130.4 KiB | 44.7 KiB | 15.6 KiB | `app/admin/content/new/page`, `app/admin/content/[id]/edit/page` | Keep; admin-only and below threshold. |
| `ffmpeg-static` | Server narration processing | 0 B client | 0 B client | 0 B client | none in client analyzer | Keep; native binary is server-only. |

Route budget check after the analyzer build:

| Route | Current | Warn | Fail |
| --- | ---: | ---: | ---: |
| `/` | 1.42 MiB | 1.56 MiB | 1.70 MiB |
| `/browse` | 1.46 MiB | 1.60 MiB | 1.75 MiB |
| `/read/[id]` | 2.00 MiB | 2.19 MiB | 2.39 MiB |
| `/notes` | 1.85 MiB | 2.03 MiB | 2.22 MiB |
| `/focus` | 1.52 MiB | 1.66 MiB | 1.81 MiB |

## Thresholds

Replacement or split work is required when one of these becomes true:

- `framer-motion` family exceeds 50 KiB gzip on `/`, appears outside `app/page`, or pushes `/` over the bundle warning budget.
- `@dnd-kit/*` exceeds 30 KiB gzip on an admin editor route, appears outside admin routes/components, or is included by any public route.
- `ffmpeg-static` appears in any client analyzer report, any public route trace, or any non-admin API trace.

These thresholds are intentionally narrower than the route-level fail budgets because they track low-use dependencies, not the whole route.

## Server Trace Evidence

`ffmpeg-static` is not present in the client analyzer. The native binary at `node_modules/ffmpeg-static/ffmpeg` is approximately 43 MiB locally.

The current build traces include `ffmpeg-static` in these server trace files:

- `.next/server/app/api/admin/content/route.js.nft.json`
- `.next/server/app/api/admin/content/[id]/route.js.nft.json`
- `.next/server/app/api/admin/content/[id]/featured/route.js.nft.json`
- `.next/server/app/api/admin/content/[id]/narration/route.js.nft.json`
- `.next/server/app/api/admin/content/bulk/route.js.nft.json`
- `.next/server/app/api/admin/narration/process/route.js.nft.json`

The `featured` route is not explicitly listed in `outputFileTracingIncludes`; it is traced through current server dependency reachability. This is acceptable because it is still admin-only, but it is a cleanup candidate if narration helpers are split more narrowly later.

## Guardrails

`scripts/check-dependency-isolation.mjs` currently enforces:

- `framer-motion` imports are allowed only in `components/ui/background-scroll-animation.tsx`.
- `@dnd-kit/*` imports are allowed only under `app/admin/` or `components/admin/`.
- `ffmpeg-static` references are allowed only in `lib/server/ai-narration.ts` and `next.config.ts`.
- `next.config.ts` may explicitly trace `ffmpeg-static` only for the current admin content/narration API routes.

If a dependency legitimately needs a wider scope, update this document and the isolation script in the same change.
