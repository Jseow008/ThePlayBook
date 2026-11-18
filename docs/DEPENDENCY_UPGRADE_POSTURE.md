# Dependency Upgrade Posture

Status: Active.

Netflux runs on current framework and runtime packages. Upgrade work should stay deliberate: security fixes move immediately, framework changes get full verification, and ordinary freshness checks stay informational so pull requests do not fail just because an upstream package released a new version.

## Cadence

- Security advisories: patch as soon as a compatible fix exists.
- Framework and runtime minors: review monthly or before launch milestones.
- Major upgrades: use a dedicated PR with the full verification checklist below.
- Tier 2 and tooling packages: review monthly, and always review during a Next.js or React major upgrade.
- Low-use or heavy dependencies: audit under `docs/RESPONSIVE_FUTURE_PROOFING.md` item 15, not as part of routine upgrade posture.

## Time-limited Picomatch advisory exception

On 18 November 2026 the owner requested a temporary advisory exception after supplying the Snyk revocation of CVE-2026-112366. GitHub still reports GHSA-fc5q-39xc-vjpf against every published Picomatch version through 4.0.7. Snyk records the maintainer dispute and marks its advisory revoked. [Snyk advisory](https://security.snyk.io/vuln/SNYK-JS-PICOMATCH-21248802), [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

`npm run security:audit` runs the normal production npm audit at the high-severity threshold, then evaluates the exact exception in `scripts/security-audit-exceptions.json`. It expires at 00:00 UTC on 2 December 2026. The exception is limited to the reviewed Picomatch 4.0.4 copies beneath Rollup CommonJS and pluginutils, reached through Sentry 10.75.2. The reviewed build code compiles configuration-controlled include/exclude patterns. Repository application code has no Picomatch call accepting request data. This is the basis for accepting the disputed advisory in these paths.

Other high/critical advisories, an escalated critical finding, additional dependency paths, changed reviewed package versions, an expired exception, or invalid/failed scanner output fail the gate. Inherited npm findings for Sentry/Rollup are traced to their original advisories, so another high-severity source still blocks. Moderate findings retain the existing high-threshold treatment. Removing or extending this exception requires a fresh source and dependency-path review recorded in a PR. When the advisory is withdrawn or an official fix is adopted, remove the exception and reassess the wrapper.

The prototype local fork was discarded after the owner supplied the revocation evidence. This release changes the audit policy for one documented advisory; the application dependency versions and Sentry integration remain at their reviewed versions.

## Tier 1 Packages

These packages affect the app runtime, rendering model, API integrations, test gate, or framework compatibility. Track them in every upgrade posture review.

| Area | Packages | Review notes |
| --- | --- | --- |
| Next.js | `next`, `@next/bundle-analyzer`, `eslint-config-next` | Keep analyzer and ESLint config compatible with the installed Next.js major. |
| React | `react`, `react-dom`, `@types/react`, `@types/react-dom` | Review hydration, Server Component, and testing-library compatibility. |
| TypeScript | `typescript` | Run typecheck before and after framework upgrades. |
| Tailwind/PostCSS | `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/typography`, `postcss` override | Keep the `postcss` override intentional and documented before changing it. |
| Sentry | `@sentry/nextjs` | Verify instrumentation files and build wrapping after upgrades. |
| Supabase | `@supabase/supabase-js`, `@supabase/ssr`, `supabase` | Review SSR auth behavior, generated types, and local CLI compatibility. |
| AI SDK | `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@google/genai` | Upgrade core and provider packages together unless compatibility notes say otherwise. |
| Playwright | `@playwright/test` | Reinstall browsers after major upgrades and run responsive suites. |
| Vitest | `vitest`, `jsdom` | Review DOM environment behavior and fake timer changes. |

## Tier 2 Packages

These packages are lower-cadence posture checks, but breaking changes can still affect product behavior, security, analytics, or tests.

| Area | Packages | Review notes |
| --- | --- | --- |
| Data fetching | `@tanstack/react-query` | Review cache, retry, and hydration behavior. |
| Analytics | `posthog-js`, `posthog-node`, `@vercel/analytics`, `@vercel/speed-insights` | Breaking changes may silently affect event capture or telemetry. |
| Rate limiting/cache | `@upstash/ratelimit`, `@upstash/redis` | Treat regressions as reliability and abuse-prevention risks. |
| UI libraries | `lucide-react`, `@phosphor-icons/react`, `sonner`, `qrcode.react` | Icon renames and component API changes should be checked visually. |
| Content/rendering | `date-fns`, `react-markdown`, `rehype-raw`, `rehype-sanitize`, `remark-breaks`, `remark-gfm`, `zod` | Review markdown sanitization and formatting behavior before major upgrades. |
| State/utilities | `zustand`, `clsx`, `tailwind-merge`, `server-only`, `tsx` | Keep single-use state dependencies intentional. |
| Testing/tooling | `eslint`, `@types/node`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`, `dotenv` | `@types/node` should track the CI Node runtime during major Node moves. |

## Special Watch Items

- `framer-motion` is currently a low-use client dependency. Keep it visible here, but evaluate bundle cost or replacement under responsive audit item 15.
- `ffmpeg-static` is a native/server-side dependency. Keep it out of client bundles and verify route tracing when audio processing changes.
- `@dnd-kit/*` is isolated to admin/editor drag-and-drop. Keep it out of public route interaction paths when possible.
- `postcss` is pinned through `package.json` overrides. Remove or change the override only with a concrete compatibility reason.
- `@sentry/bundler-plugin-core` uses a scoped `glob` override at `14.0.6` to
  address GHSA-3g3m-2fjr-6pw4 and bring its matcher onto patched `minimatch`
  `11.0.9` (GHSA-g3hv-75wg-m249). Sentry itself stays at `10.75.2`; verify
  its build integration and file globbing when changing or removing this pin.
  The separate `picomatch` GHSA-fc5q-39xc-vjpf has no published patched version
  as of 18 November 2026. PR #384 remains held with auto-merge disabled until
  an upstream remedy is available and verified; the audit gate is unchanged.

## Verification Order For Framework Upgrades

Run the full sequence for Next.js, React, Tailwind/PostCSS, Sentry, Supabase, AI SDK, Playwright, Vitest, and TypeScript upgrades:

```bash
npm ci
npm run check:dependency-posture
npm run lint
npm run typecheck
npm run test
npm run build
npm run analyze:ci
npm run check:bundle-budgets
npm run test:e2e:responsive
npm run test:e2e:responsive:surfaces
```

For security-focused dependency changes, also run:

```bash
npm run security:audit
```

If a Playwright major upgrade lands, run:

```bash
npx playwright install --with-deps
```

## Checker Contract

`npm run check:dependency-posture` is a structural gate. It fails only when:

- `package.json` or required metadata cannot be read.
- a tracked package is missing from `dependencies`, `devDependencies`, or `overrides`.

It does not fail when newer upstream versions exist. Freshness reporting belongs to:

```bash
npm run deps:outdated
```

That command is intentionally informational for scheduled visibility.
