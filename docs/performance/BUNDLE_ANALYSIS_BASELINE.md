# Bundle Analysis Baseline

Generated: 2026-07-01.

Command:

```bash
npm run analyze:ci
```

The webpack analyzer generated local HTML reports under `.next/analyze/`:

- `.next/analyze/client.html`
- `.next/analyze/nodejs.html`
- `.next/analyze/edge.html`

Those HTML reports are intentionally ignored. The committed artifact is the route budget summary in `docs/performance/bundle-budgets.json`.

## Route Summary

| Route | Budget Key | Baseline |
|---|---|---:|
| `/` | `/page` | 1.42 MiB |
| `/browse` | `/(public)/browse/page` | 1.46 MiB |
| `/read/[id]` | `/(public)/read/[id]/[[...slug]]/page` | 1.99 MiB |
| `/notes` | `/(public)/notes/page` | 1.85 MiB |
| `/focus` | `/(public)/focus/page` | 1.51 MiB |

Metric: `clientReferenceManifestJsBytes`, calculated from webpack client reference manifests plus root client chunks.

## Notes

- The normal `npm run build` path remains unchanged.
- `npm run analyze:ci` uses `next build --webpack` because `@next/bundle-analyzer` does not emit reports for Turbopack builds.
- The build completed successfully, but the OG image route logged existing local asset/font loading errors while collecting page data. The build still exited 0.
- No additional lazy-loading refactor was performed from this baseline alone. Future splits should be driven by analyzer evidence and must preserve the existing Netflux page structure and design system.
