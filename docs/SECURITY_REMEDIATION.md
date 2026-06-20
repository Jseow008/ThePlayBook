# Netflux Security Remediation Plan

This document is the source of truth for pre-production security work. Do not ship production until all P0 items are complete and verified. P1 items should be complete before public launch unless explicitly risk-accepted.

Last updated: 2026-06-21

## Operating Rules

- Treat live production state as authoritative over migration intent.
- Prefer defense in depth: route auth, database grants, RLS, and runtime guards should all agree.
- Do not rely on service-role access from public endpoints unless there is no safer alternative.
- Every remediation must include verification: automated test, Supabase advisor result, direct SQL assertion, or runtime smoke test.
- Record any risk acceptance in this file with owner, date, reason, and revisit date.

## P0: Production Blockers

### 1. Verify and repair live Supabase function ACLs

Status: Complete on 2026-06-21.

Issue: Live Supabase advisor and direct ACL query showed multiple `SECURITY DEFINER` functions executable by `anon` and `authenticated`, including admin-style functions. Migration files show hardening intent, so production may have migration drift.

Known affected functions to verify:

- `public.insert_generated_content`
- `public.admin_finalize_narration_generation`
- `public.claim_content_request_notifications`
- `public.queue_content_request_published_notifications`
- `public.handle_new_user`
- `public.is_admin`
- `public.invalidate_gemini_segment_embedding_on_body_change`
- `public.set_onboarding_state`
- `public.get_homepage_sections_with_items`
- `public.get_trending_content`

Required outcome:

- Admin mutation functions are executable only by `service_role`.
- Trigger-only functions are not directly executable by `anon` or `authenticated`.
- Public read RPCs are either `SECURITY INVOKER` or have tightly scoped definer behavior.
- All definer functions have fixed `search_path`.

Verification:

```sql
select n.nspname as schema,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.proconfig as config,
       p.proacl::text as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname, arguments;
```

Acceptance criteria:

- Supabase security advisor has no unexpected `anon_security_definer_function_executable` or `authenticated_security_definer_function_executable` findings.
- Direct ACL query confirms no admin definer function grants to `anon`, `authenticated`, or `PUBLIC`.

Implementation notes:

- Added and applied `supabase/migrations/20260620165423_harden_function_acls.sql`.
- Added and applied `supabase/migrations/20260620165558_convert_user_definer_helpers_to_invoker.sql`.
- Converted public read RPCs `get_homepage_sections_with_items` and `get_trending_content` to `SECURITY INVOKER`.
- Converted user-scoped helpers `is_admin` and `set_onboarding_state` to `SECURITY INVOKER`; added an authenticated-only RLS policy and column-level `UPDATE (onboarding_state)` grant for onboarding state.
- Added `supabase/migrations/20260620171503_validate_onboarding_state_keys.sql` to bound `set_onboarding_state` tour keys and version values.
- Added service-role runtime guards to `insert_generated_content` and `admin_finalize_narration_generation`.
- Verified live `SECURITY DEFINER` functions now have fixed `search_path` and no `anon`, `authenticated`, or `PUBLIC` ACL grants except no longer applicable invoker functions.
- Verified Supabase security advisor no longer reports `anon_security_definer_function_executable` or `authenticated_security_definer_function_executable`.

### 2. Upgrade Next.js to patched release

Status: Complete for Next.js on 2026-06-21.

Issue: `next@16.2.4` has high-severity advisories, including proxy/middleware bypass, SSRF, and DoS classes.

Required outcome:

- Upgrade `next`, `@next/bundle-analyzer`, and related Next packages to a patched compatible version.
- Keep React/Sentry/Vercel package compatibility intact.

Verification:

```bash
npm audit --omit=dev
npm run lint
npm run typecheck
npm run test
npm run build
```

Acceptance criteria:

- No high or critical production advisories remain for Next.js.
- App builds and core tests pass.

Implementation notes:

- Upgraded `next` from `16.2.4` to `16.2.9`.
- Upgraded `@next/bundle-analyzer` from `16.2.4` to `16.2.9`.
- Kept `react` and `react-dom` on `19.2.5`; kept `@sentry/nextjs` on `10.58.0`.
- Verified `npm audit --omit=dev` no longer reports Next.js advisories. The command still exits nonzero because of unrelated production advisories in `protobufjs` and `ws`, plus moderate/low advisories tracked separately.
- Verified `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass on Next.js `16.2.9`.

## P1: High Priority Before Launch

### 3. Add runtime guards inside admin `SECURITY DEFINER` functions

Status: Complete for admin mutation RPCs on 2026-06-21.

Issue: Grants can drift. Admin definer functions should reject non-service-role callers even if grants are accidentally opened.

Required outcome:

- Every admin mutation RPC starts with an explicit role check:

```sql
if auth.role() <> 'service_role' then
  raise exception 'requires service role';
end if;
```

Functions to review:

- `admin_update_content_graph`
- `admin_finalize_narration_generation`
- `insert_generated_content`
- notification queue/claim functions
- embedding maintenance functions

Acceptance criteria:

- Direct calls as `anon`/`authenticated` fail even if execute privilege is mistakenly present.

Implementation notes:

- Added and applied `supabase/migrations/20260620171256_guard_admin_update_content_graph.sql`.
- Verified `admin_update_content_graph` remains `SECURITY DEFINER`, has fixed `search_path`, is executable only by `service_role`, and now contains an internal `auth.role() <> 'service_role'` guard.
- Verified rollback smoke tests:
  - `authenticated` cannot call `admin_update_content_graph`.
  - `service_role` reaches the function's normal `p_content_id is required` validation path.
- Added `npm run security:function-acls` as the CI-ready ACL drift check. It runs `scripts/security-function-acl-check.sql` through the Supabase CLI and fails if any public `SECURITY DEFINER` function is executable by `anon`/`authenticated` or lacks a fixed `search_path`.
- Existing trigger-only definer functions remain direct-execute locked to `service_role`; they are not public/admin RPC entrypoints.

### 4. Validate `x-forwarded-host` in auth callback

Issue: `app/auth/callback/route.ts` builds redirect URLs from `x-forwarded-host`. If spoofable, this can become an open redirect.

Required outcome:

- Only allow redirect hosts from an explicit allowlist derived from production domains.
- Fall back to configured canonical origin when host is not allowed.

Acceptance criteria:

- Tests cover valid host, spoofed host, and local development behavior.

### 5. Restrict detailed `/api/health` output

Issue: `/api/health` exposes environment, DB reachability, readiness details, and missing service names.

Required outcome:

- Public unauthenticated response returns only coarse status.
- Detailed readiness requires an internal secret, admin session, or platform-internal network access.

Acceptance criteria:

- Anonymous request cannot see detailed env/service readiness.
- Authorized health check still supports deployment monitoring.

### 6. Remove service-role usage from public email subscription routes

Issue: Public unauthenticated email routes use `getAdminClient()`. A handler bug would bypass RLS with service-role power.

Affected routes:

- `app/api/email-subscriptions/route.ts`
- `app/api/email-subscriptions/unsubscribe/route.ts`
- `app/api/notification-preferences/request-published/unsubscribe/route.ts`

Preferred outcome:

- Add narrow RLS policies and use a non-admin Supabase client.
- For unsubscribe flows, use token-scoped RPCs with strict validation and no broad table access.

Acceptance criteria:

- Public handlers no longer import `getAdminClient()`.
- RLS policies constrain operations to exactly the intended row/token.
- Tests cover invalid token, valid token, duplicate subscription, and malformed payload.

### 7. Enforce production admin IP allowlist configuration

Issue: `ADMIN_ALLOWED_IPS` silently disables admin IP gating when unset.

Required outcome:

- Production startup or launch validation fails if `ADMIN_ALLOWED_IPS` is unset, unless an explicit alternative admin access control is configured.
- Document whether the source of truth is Vercel Firewall or app-level proxy.

Acceptance criteria:

- `validate:launch-env` fails production validation without admin access control.
- Deployment docs specify how admin paths are protected.

### 8. Lock down anonymous activity analytics

Issue: Anonymous activity logging can inflate content analytics and reader counts with arbitrary `visitor_id` and `content_id` payloads.

Required outcome:

- Add stronger abuse controls for anonymous activity:
  - stricter per-IP and per-visitor limits
  - verified content-only checks
  - optional signed visitor IDs or server-issued anonymous session token
  - anomaly monitoring for high-volume activity

Acceptance criteria:

- Invalid/unverified content IDs cannot affect analytics.
- Repeated forged visitors from one client are throttled.
- Tests cover anonymous abuse cases.

## P2: Important Hardening

### 9. Make expensive public routes fail closed or degrade safely

Issue: `bestEffortRateLimit` allows traffic when Redis is missing or unavailable.

Affected routes include:

- `/api/recommendations`
- `/api/recommendations/browse`
- `/api/focus`
- `/api/content/batch`
- `/api/landing/category-content`

Required outcome:

- Expensive dynamic routes fail closed in production when Redis is unavailable, or return cached/static fallback responses.

Acceptance criteria:

- Production tests simulate missing Upstash config and confirm expensive routes do not run unthrottled.

### 10. Add CSP violation reporting

Issue: CSP exists, but production has no report endpoint or external reporting collector.

Required outcome:

- Add `report-to` or `report-uri` for CSP violations.
- Send reports to Sentry, PostHog, or a minimal internal endpoint with rate limiting.

Acceptance criteria:

- Controlled CSP violation produces an observable report without logging sensitive payloads.

### 11. Move toward nonce/hash-based CSP

Issue: Production CSP allows `script-src 'unsafe-inline'`.

Required outcome:

- Remove inline scripts or protect them with nonce/hash.
- Keep Sentry/PostHog/Next requirements compatible.

Acceptance criteria:

- Production CSP no longer requires `unsafe-inline` for scripts.
- No console CSP errors in browser smoke tests.

### 12. Restrict embedding table reads

Issue: `segment_embedding` and `segment_embedding_gemini` allow broad SELECT. Even if embeddings are not raw text, they are derived corpus data.

Required outcome:

- Restrict embedding SELECT to service-role where possible.
- If client RPCs need vector matching, expose only safe RPCs that filter to verified content and current user library.

Acceptance criteria:

- `anon` cannot directly list embeddings.
- Ask/recommendation flows still work through approved RPCs.

### 13. Controlled dependency remediation

Issue: `npm audit --omit=dev` reports production advisories beyond Next.js, including `protobufjs`, `ws`, `posthog-js` transitive packages, and related OpenTelemetry packages.

Required outcome:

- Upgrade direct dependencies where possible.
- Use package overrides only when upstream does not expose a patched compatible version.
- Avoid blind `npm audit fix` if it causes unsafe major-version churn.

Acceptance criteria:

- No high or critical production advisories remain.
- Remaining moderate advisories are documented with impact and owner.

### 14. Public bucket listing policy review

Issue: Supabase advisor reports `media` and `audio` public buckets allow object listing via broad SELECT policies.

Required outcome:

- Remove broad object listing policies if public object URLs do not need them.
- Keep object URL access for known assets.

Acceptance criteria:

- Public users cannot list bucket contents.
- Existing image/audio playback still works.

## P3: Cleanup and Future-Proofing

### 15. Document RLS-enabled tables with no policies

Issue: Supabase advisor reports RLS enabled with no policies on analytics tables.

Affected tables:

- `content_reader_daily`
- `content_reader_visitor_daily`
- `content_reading_activity`

Required outcome:

- Document whether these are intentionally write-only/service-only aggregation tables.
- Add tests or SQL assertions to prevent accidental public reads/writes.

Acceptance criteria:

- Future maintainers understand the pattern.
- Supabase advisor finding is either resolved or explicitly risk-accepted.

### 16. Add security gates to CI/deployment

Status: Partially complete. `npm run security:function-acls` now covers Supabase `SECURITY DEFINER` ACL/search_path drift.

Required checks:

- `npm audit --omit=dev`
- secret scan excluding known generated caches
- Supabase security advisors
- Supabase `SECURITY DEFINER` ACL drift check with `npm run security:function-acls`
- launch env validation
- tests for public/admin route authorization

Acceptance criteria:

- Production deployment blocks on P0/P1 security regressions.

### 17. Remove tracked local/generated artifacts

Issue: `.npm-cache-temp` and `test-results` are tracked or present in ways that make security scans noisy and increase repository risk.

Required outcome:

- Remove generated cache artifacts from git.
- Add missing ignore rules for local caches and test outputs.

Acceptance criteria:

- `git ls-files .npm-cache-temp test-results` returns no tracked artifacts.
- Secret scans no longer process generated npm cache contents.

### 18. Improve security observability

Required outcome:

- Alert on repeated auth failures for admin routes.
- Alert on repeated invalid unsubscribe tokens.
- Alert on AI/chat route abuse and rate-limit exhaustion.
- Monitor Supabase advisor regressions.

Acceptance criteria:

- Security-relevant failures produce useful, non-sensitive telemetry.

## Verification Checklist Before Production

- [ ] Supabase security advisor has no unaccepted warnings for function ACLs, public definer functions, mutable search paths, or public bucket listing.
- [ ] Direct SQL confirms admin RPCs are not executable by `anon`/`authenticated`.
- [ ] `npm audit --omit=dev` has no high or critical vulnerabilities.
- [ ] `npm run validate:launch-env -- --env-file <production-env>` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] Browser smoke tests cover login, auth callback, public browse/read, admin access denied, admin access allowed, and health endpoint behavior.
- [ ] Admin path protection is verified at the platform layer or via enforced env checks.

## Risk Acceptance Log

No accepted risks yet.

Use this format when needed:

```text
Date:
Owner:
Issue:
Reason for acceptance:
Compensating controls:
Revisit date:
```
