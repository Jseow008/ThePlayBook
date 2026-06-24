# Netflux Security Remediation Plan

This document is the source of truth for pre-production security work. Do not ship production until all P0 items are complete and verified. P1 items should be complete before public launch unless explicitly risk-accepted.

Last updated: 2026-06-23

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

Status: Complete after full live function classification on 2026-06-22.

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
- Added and applied `supabase/migrations/20260621161235_audit_admin_definer_runtime_guards.sql` after a live inventory of every `public` function.
- Added runtime `auth.role() <> 'service_role'` guards to service-only analytics definer RPCs:
  - `increment_reading_activity_for_user(date, integer, uuid)`
  - `log_reading_activity(date, integer, uuid)`
  - `log_anonymous_reading_activity(date, integer, uuid, text)`
  - `log_reading_activity_for_user(date, integer, uuid, uuid)`
- Confirmed all non-trigger `SECURITY DEFINER` RPCs now have fixed `search_path`, service-role-only execute grants, and an internal service-role guard.
- Confirmed trigger-only helpers are not directly executable by `anon` or `authenticated`; no runtime role guard was added to trigger-only functions to avoid breaking trigger context.
- Fixed mutable `search_path` on public functions discovered during classification, including public read RPCs, embedding maintenance RPCs, recommendation/vector RPCs, and trigger helpers.
- Verified rollback smoke tests:
  - `authenticated` cannot call `admin_update_content_graph`.
  - `service_role` reaches the function's normal `p_content_id is required` validation path.
- Added `npm run security:function-acls` as the CI-ready ACL drift check. It runs `scripts/security-function-acl-check.sql` through the Supabase CLI and fails if:
  - any public `SECURITY DEFINER` function is executable by `anon` or `authenticated`, except the exact token/email-scoped item 6 allowlist
  - any public `SECURITY DEFINER` function lacks fixed `search_path`
  - any non-trigger public `SECURITY DEFINER` RPC lacks an internal service-role guard
  - any trigger-backed helper is directly executable by `anon` or `authenticated`
- Verified smoke tests:
  - `authenticated` cannot call guarded activity definer RPCs.
  - `service_role` reaches the guarded functions' normal validation paths.
- Verified `npm run security:function-acls` passes against the linked Supabase project.
- Supabase security advisor has no `SECURITY DEFINER` anon/auth execute findings after this pass. Remaining advisor findings are tracked separately: analytics RLS-with-no-policy, public bucket listing, and leaked password protection.

Function classification summary:

| Category | Functions | Required control |
| --- | --- | --- |
| Service-only/admin definer RPCs | `admin_update_content_graph`, `admin_finalize_narration_generation`, `insert_generated_content`, `queue_content_request_published_notifications`, `claim_content_request_notifications`, `submit_content_request`, `increment_reading_activity_for_user`, `log_reading_activity`, `log_anonymous_reading_activity`, `log_reading_activity_for_user` | `SECURITY DEFINER`, fixed `search_path`, service-role-only execute grant, internal service-role guard |
| Trigger-only helpers | `handle_new_user`, `invalidate_gemini_segment_embedding_on_body_change`, `update_content_request_vote_count`, `update_updated_at_column` | fixed `search_path`, no direct `anon`/`authenticated` execute grant, no runtime service-role guard |
| Public read/recommendation RPCs | `get_category_stats`, `get_homepage_sections_with_items`, `get_random_verified_content`, `get_trending_content`, `match_recommendations` | `SECURITY INVOKER`, fixed `search_path`, intentionally public |
| Public token/email RPCs | `subscribe_email_subscription`, `unsubscribe_email_subscription_by_token`, `unsubscribe_request_published_notifications_by_token` | `SECURITY DEFINER`, fixed `search_path`, exact allowlist in `npm run security:function-acls`, no broad table grants |
| Authenticated user RPCs | `is_admin`, `set_onboarding_state`, `match_library_segments_gemini` | `SECURITY INVOKER`, fixed `search_path`, authenticated-only or user-scoped filtering |
| Service-only maintenance RPCs | `get_segments_missing_gemini_embeddings`, `get_gemini_segment_embedding_coverage`, `increment_reading_activity` | fixed `search_path`, no `anon`/`authenticated` execute grant |
| Legacy embedding maintenance gap | `get_segments_missing_embeddings` | fixed `search_path`; execute grant lockdown remains tracked in item 13 |

### 4. Validate `x-forwarded-host` in auth callback

Status: Complete on 2026-06-21.

Issue: `app/auth/callback/route.ts` builds redirect URLs from `x-forwarded-host`. If spoofable, this can become an open redirect.

Required outcome:

- Only allow redirect hosts from an explicit allowlist derived from production domains.
- Fall back to configured canonical origin when host is not allowed.

Acceptance criteria:

- Tests cover valid host, spoofed host, and local development behavior.

Implementation notes:

- `app/auth/callback/route.ts` now derives trusted production redirect origins from `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL`.
- `x-forwarded-host` is accepted only when its normalized host exactly matches one of those configured origins.
- Spoofed, malformed, comma-separated, path-bearing, or otherwise invalid forwarded hosts fall back to the configured canonical app origin.
- Development keeps redirects on the request origin so local callbacks continue to work.
- Production fails closed with a `500` JSON response when no valid configured auth redirect origin exists, and does not exchange the auth code in that state.
- Added `tests/api/auth-callback.test.ts` covering valid forwarded host, spoofed forwarded host, malformed forwarded host, local development behavior, one-valid-origin production behavior, missing/malformed production origin fail-closed behavior, and auth error redirect fallback.

### 5. Restrict detailed `/api/health` output

Status: Complete on 2026-06-21.

Issue: `/api/health` exposes environment, DB reachability, readiness details, and missing service names.

Required outcome:

- Public unauthenticated response returns only coarse status.
- Detailed readiness requires an internal secret, admin session, or platform-internal network access.

Acceptance criteria:

- Anonymous request cannot see detailed env/service readiness.
- Authorized health check still supports deployment monitoring.

Implementation notes:

- Anonymous `/api/health` responses now act as shallow liveness checks and include only coarse `status` and `timestamp`.
- Anonymous `/api/health` requests do not run readiness evaluation, create a Supabase client, or query the database.
- Detailed `environment`, `database`, `readiness`, and `issues` fields require `HEALTH_CHECK_SECRET` via `Authorization: Bearer <secret>` or `x-health-check-secret`.
- Authorized database readiness checks are cached briefly in-process to reduce monitor burst pressure.
- Concurrent authorized database probe refreshes are collapsed into one in-flight query per process.
- Authorized database probes use an abortable 2.5 second timeout and return degraded instead of hanging when Supabase is slow or unavailable.
- `scripts/check-deployment-health.mjs` now forwards `HEALTH_CHECK_SECRET` when present, and also accepts `--secret`.
- `scripts/validate-launch-env.mjs` now requires `HEALTH_CHECK_SECRET` for production validation.
- Tests cover anonymous liveness output, anonymous no-DB behavior, authorized detailed output, authorized DB readiness caching, concurrent request collapsing, timeout/abort behavior, and deployment-health secret forwarding.

### 6. Remove service-role usage from public email subscription routes

Status: Complete on 2026-06-22.

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

Implementation notes:

- Added `supabase/migrations/20260622120000_add_public_email_subscription_rpcs.sql`.
- Added `supabase/migrations/20260622121500_lock_public_email_table_grants.sql`.
- Added three narrow public `SECURITY DEFINER` RPCs:
  - `subscribe_email_subscription(text, text, text, text, text, text, text)`
  - `unsubscribe_email_subscription_by_token(text)`
  - `unsubscribe_request_published_notifications_by_token(text)`
- The public unsubscribe/subscription routes now use `createPublicServerClient()` with the anon key instead of `getAdminClient()`.
- The authenticated `/api/notification-preferences` route now uses the user-scoped Supabase server client and authenticated RLS instead of `getAdminClient()`.
- Anonymous direct table privileges were removed from `email_subscription` and `user_notification_preferences`.
- Authenticated direct table privileges were removed from `email_subscription`; authenticated `user_notification_preferences` access is limited to own-row `SELECT`, `INSERT`, and `UPDATE`.
- Subscription writes are constrained by database-side email/source/length validation and idempotent `ON CONFLICT (email_normalized)` resubscribe behavior.
- Unsubscribe writes are token-scoped, validate hex tokens, and intentionally return generic success without revealing whether a token matched a row.
- Added exact public definer allowlist entries to `scripts/security-function-acl-check.sql`; all other public `SECURITY DEFINER` functions remain blocked from anon/authenticated execution.
- Added route tests for valid token, invalid token, duplicate subscription behavior through the idempotent RPC, malformed payloads, RPC failure handling, and rate limiting on the request-published unsubscribe endpoint.
- Supabase security advisor reports expected `anon_security_definer_function_executable` and `authenticated_security_definer_function_executable` warnings for the three item 6 RPCs. These are intentional public token/email-scoped exceptions; admin/service-only definer findings remain unexpected and blocked by `npm run security:function-acls`.

### 7. Enforce production admin IP allowlist configuration

Status: Complete on 2026-06-22.

Issue: `ADMIN_ALLOWED_IPS` silently disables admin IP gating when unset.

Required outcome:

- Production startup or launch validation fails if `ADMIN_ALLOWED_IPS` is unset, unless an explicit alternative admin access control is configured.
- Document whether the source of truth is Vercel Firewall or app-level proxy.

Acceptance criteria:

- `validate:launch-env` fails production validation without admin access control.
- Deployment docs specify how admin paths are protected.

Implementation notes:

- App-level proxy enforcement in `proxy.ts` is the source of truth for admin path network access.
- `ADMIN_ALLOWED_IPS` is now required by `npm run validate:launch-env`.
- `ADMIN_ALLOWED_IPS` format validation rejects empty comma-separated entries and malformed IPv4/IPv6 values.
- Production admin paths fail closed with a generic `404` when `ADMIN_ALLOWED_IPS` is unset or empty.
- Non-production keeps the unset allowlist behavior open for local development.
- Valid `CRON_SECRET` requests to admin processor endpoints continue to bypass the admin IP gate.
- `docs/OPS.md` documents the protected paths, source of truth, and Vercel Firewall defense-in-depth stance.
- `.env.example` now shows `ADMIN_ALLOWED_IPS` as required for production launch validation.

### 8. Lock down anonymous activity analytics

Status: Complete on 2026-06-22.

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

Implementation notes:

- Added `supabase/migrations/20260621170836_harden_anonymous_activity_analytics.sql`.
- `log_anonymous_reading_activity`, `log_reading_activity_for_user`, and legacy `log_reading_activity` now reject content IDs unless the content item is `verified` and not deleted.
- `/api/activity/log` verifies content status before calling content-level activity RPCs for both anonymous and authenticated readers.
- Anonymous activity now requires a server-issued visitor token signed with `ANONYMOUS_ACTIVITY_SECRET` in production.
- Added `/api/activity/anonymous-session` to issue anonymous `visitor_id` and `visitor_token` pairs.
- `useReadingTimer` fetches and caches the anonymous activity session before sending anonymous heartbeats.
- Added anonymous-only throttles:
  - per-IP anonymous activity limit
  - per-visitor anonymous activity limit
  - per-IP plus content-item anonymous activity limit
- Rejected anonymous activity logs structured warning metadata for rate-limit, invalid-token, and invalid-content cases.
- `ANONYMOUS_ACTIVITY_SECRET` is now required by `npm run validate:launch-env` and documented in `.env.example` and `docs/OPS.md`.
- Tests cover invalid/unverified content rejection, production token enforcement, valid signed tokens, per-IP throttling, per-visitor throttling, and the updated reader heartbeat token flow.
- Live Supabase smoke checks verified:
  - draft content is rejected by `log_anonymous_reading_activity`
  - nonexistent content is rejected by `log_anonymous_reading_activity`
  - verified content succeeds inside a rollback transaction

## P2: Important Hardening

### 9. Make expensive public routes fail closed or degrade safely

Status: Complete on 2026-06-23.

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

Implementation notes:

- Added `strictPublicRateLimit` and `rateLimitFailureResponse` in `lib/server/rate-limit.ts`.
- `strictPublicRateLimit` preserves the development in-memory fallback through `rateLimit`, but catches production `RateLimitBackendUnavailableError` and fails closed instead of allowing traffic.
- Backend-unavailable failures return `503` with:
  - `error.code = RATE_LIMIT_UNAVAILABLE`
  - generic client message `Service temporarily unavailable.`
  - `Retry-After: 60`
- Moved these expensive public dynamic routes from `bestEffortRateLimit` to `strictPublicRateLimit`:
  - `/api/recommendations`
  - `/api/recommendations/browse`
  - `/api/focus`
  - `/api/content/batch`
  - `/api/landing/category-content`
- Tests confirm missing production Upstash configuration fails closed through the strict helper.
- Route tests confirm each affected route returns `503` and does not call Supabase/RPC/query code when strict rate limiting is unavailable.
- `bestEffortRateLimit` remains available for explicitly low-risk routes that can safely degrade.

### 10. Add CSP violation reporting

Status: Complete on 2026-06-23.

Issue: CSP exists, but production has no report endpoint or external reporting collector.

Required outcome:

- Add `report-to` or `report-uri` for CSP violations.
- Send reports to Sentry, PostHog, or a minimal internal endpoint with rate limiting.

Acceptance criteria:

- Controlled CSP violation produces an observable report without logging sensitive payloads.

Implementation notes:

- Added same-origin report endpoint at `/api/security/csp-report`.
- CSP now includes both legacy `report-uri /api/security/csp-report` and modern `report-to csp-endpoint`.
- Responses now include `Reporting-Endpoints: csp-endpoint="<absolute-origin>/api/security/csp-report"`.
- The endpoint accepts legacy `application/csp-report` payloads and Reporting API `application/reports+json` batches.
- CSP report ingestion is rate-limited with `rateLimit`; production Redis/rate-limit backend failures fail closed with `503`.
- Reports are sent to Sentry as warning-level `CSP violation` messages with sanitized context only.
- Sanitization strips query strings and fragments from document/source URLs, keeps only origins for URL-like blocked resources, omits `original-policy`, and never stores raw `script-sample`.
- `docs/OPS.md` documents a controlled `curl` verification command and the expected sanitized Sentry event.

### 11. Move toward nonce/hash-based CSP

Status: Report-only trial implemented on 2026-06-23. Final enforcement remains pending production report review.

Issue: Production CSP allows `script-src 'unsafe-inline'`.

Required outcome:

- Remove inline scripts or protect them with nonce/hash.
- Keep Sentry/PostHog/Next requirements compatible.

Acceptance criteria:

- Production CSP no longer requires `unsafe-inline` for scripts.
- No console CSP errors in browser smoke tests.

Implementation notes:

- Added a production-only `Content-Security-Policy-Report-Only` header that uses `script-src 'self';` with no script `unsafe-inline`.
- The existing enforcing `Content-Security-Policy` intentionally remains unchanged for now to avoid breaking Next.js runtime scripts before we have production/staging violation data.
- Report-only CSP keeps the existing same-origin reporting pipeline: `report-uri /api/security/csp-report`, `report-to csp-endpoint`, and the `Reporting-Endpoints` header from item 10.
- `next.config.ts` now exposes `buildContentSecurityPolicy()` and `buildSecurityHeaders()` so enforced and report-only CSP behavior can be tested separately.
- Tests assert that production emits the strict report-only script policy, that the report-only script policy omits `unsafe-inline`, and that non-production does not emit the trial header.

Next steps before marking complete:

- Deploy to staging/preview and observe Sentry `CSP violation` warnings for real browser traffic.
- Run browser smoke tests on `/`, `/browse`, `/read/[id]/...`, `/series/[slug]`, `/login`, and representative admin pages.
- Decide enforcement strategy after reviewing reports:
  - If violations are only expected Next runtime inline scripts, evaluate nonce CSP route-by-route and document any ISR/dynamic-rendering tradeoff.
  - If violations are app-owned or third-party inline scripts, remove/configure those scripts or add stable hashes only where appropriate.
- Remove script `unsafe-inline` from the enforcing production CSP only after the report-only policy is clean or each remaining violation has an accepted mitigation.

### 12. Restrict embedding table reads

Status: Complete on 2026-06-23.

Issue: `segment_embedding` and `segment_embedding_gemini` allow broad SELECT. Even if embeddings are not raw text, they are derived corpus data.

Required outcome:

- Restrict embedding SELECT to service-role where possible.
- If client RPCs need vector matching, expose only safe RPCs that filter to verified content and current user library.

Acceptance criteria:

- `anon` cannot directly list embeddings.
- Ask/recommendation flows still work through approved RPCs.

Implementation notes:

- Added and applied `supabase/migrations/20260622165437_restrict_embedding_table_reads.sql` to linked Supabase project `xmuqsgfxuaaophxnwure`.
- Removed the permissive embedding table read policies:
  - `Enable read access for all users` on `public.segment_embedding`
  - `Enable read access for all users on Gemini segment embeddings` on `public.segment_embedding_gemini`
- Revoked direct `SELECT` on both embedding tables from `PUBLIC`, `anon`, and `authenticated`; retained service-role table access.
- Preserved the public Ask RPC signatures as `SECURITY INVOKER` wrappers:
  - `match_library_segments(vector, double precision, integer, uuid)`
  - `match_library_segments_gemini(vector, double precision, integer, uuid, boolean)`
- Added guarded private `SECURITY DEFINER` helpers for the privileged vector reads, with fixed `search_path = public, extensions`.
- The private helpers reject cross-user matching unless `auth.role() = 'service_role'`, and filter to the requested user's library plus `content_item.status = 'verified'` and `content_item.deleted_at IS NULL`.
- Removed the `/api/chat` direct `segment_embedding_gemini` count fallback; empty RPC match results now degrade to limited-evidence metadata context without probing the embedding table.
- Added `npm run security:embedding-table-reads`, backed by `scripts/security-embedding-table-read-check.sql`, to verify direct grants, removed policies, helper guards, and public RPC anon exposure.
- Added static regression coverage in `tests/security/embedding-table-reads.test.ts` and updated chat tests to assert the embedding table is not directly queried by the user client.
- Live verification notes:
  - `public.segment_embedding` is absent in the linked database, so legacy direct table privilege assertions return `NULL`.
  - `anon` and `authenticated` direct `SELECT` on `public.segment_embedding_gemini` return `false`.
  - `anon` execute on `match_library_segments(...)` and `match_library_segments_gemini(...)` returns `false`.
  - `authenticated` execute on `match_library_segments_gemini(...)` returns `true`.
  - `npm run security:embedding-table-reads` passes against the linked Supabase project.
  - `npm run security:function-acls` passes against the linked Supabase project.

### 13. Lock down embedding maintenance RPC exposure

Issue: Cross-checking P1 admin `SECURITY DEFINER` guards found that some embedding-related maintenance RPCs are not `SECURITY DEFINER`, but still have broad execute grants. In particular, legacy `get_segments_missing_embeddings(integer)` is currently callable by `PUBLIC`, `anon`, and `authenticated`. This is not part of the admin-definer guard requirement, but it is still an unnecessary maintenance surface.

Status: Complete on 2026-06-24.

Functions to review:

- `get_segments_missing_embeddings(integer)`
- `get_segments_missing_gemini_embeddings(integer)`
- `get_gemini_segment_embedding_coverage()`
- `match_library_segments(vector, double precision, integer, uuid)`
- `match_library_segments_gemini(vector, double precision, integer, uuid, boolean)`

Required outcome:

- Maintenance and coverage RPCs are executable only by `service_role`.
- User-facing vector match RPCs remain callable only by roles that actually need them, and continue to filter to the current user/library where applicable.
- All embedding-related RPCs have fixed `search_path`.

Acceptance criteria:

- `anon` cannot call embedding maintenance or coverage RPCs.
- `authenticated` cannot call service-only embedding maintenance RPCs.
- Ask/recommendation flows still work through approved user-facing RPCs.
- Supabase advisor no longer reports mutable `search_path` for embedding RPCs.

Implementation notes:

- Added and applied `supabase/migrations/20260624083713_lock_down_embedding_rpc_exposure.sql` to linked Supabase project `xmuqsgfxuaaophxnwure`.
- `supabase db push --dry-run` remains blocked by pre-existing remote migration-history drift, so the migration SQL was applied with `supabase db query --file`.
- Revoked `EXECUTE` on embedding maintenance and coverage RPCs from `PUBLIC`, `anon`, and `authenticated`; granted those RPCs only to `service_role`.
- Fully reset public match RPC grants by revoking from `PUBLIC`, `anon`, and `authenticated`, then granting back only to `authenticated` and `service_role`.
- Preserved item 12's matching architecture: public `SECURITY INVOKER` wrappers continue to delegate privileged embedding reads to guarded private `SECURITY DEFINER` helpers with explicit user-boundary and verified-content filters.
- Reasserted fixed `search_path` on reviewed embedding RPCs.
- Extended `npm run security:embedding-table-reads` to check embedding RPC ACLs and fixed `search_path` in addition to direct embedding table read exposure.
- Live direct ACL verification confirms:
  - `anon` and `authenticated` cannot execute `get_segments_missing_embeddings(integer)`, `get_segments_missing_gemini_embeddings(integer)`, or `get_gemini_segment_embedding_coverage()`.
  - `service_role` can execute the maintenance and coverage RPCs.
  - `anon` cannot execute `match_library_segments(...)` or `match_library_segments_gemini(...)`.
  - `authenticated` and `service_role` can execute the public match RPCs.
  - all five reviewed public RPCs have fixed `search_path`.
- Supabase security advisors no longer report mutable `search_path` for embedding RPCs; remaining advisor findings are tracked by other remediation items or intentional token/email public RPC allowlists.
- `npm run security:embedding-table-reads`, `npm run security:function-acls`, targeted API/security tests, and `npm run typecheck` pass.

### 14. Controlled dependency remediation

Status: Complete on 2026-06-24.

Issue: `npm audit --omit=dev` reports production advisories beyond Next.js, including `protobufjs`, `ws`, `posthog-js` transitive packages, and related OpenTelemetry packages.

Required outcome:

- Upgrade direct dependencies where possible.
- Use package overrides only when upstream does not expose a patched compatible version.
- Avoid blind `npm audit fix` if it causes unsafe major-version churn.

Acceptance criteria:

- No high or critical production advisories remain.
- Remaining moderate advisories are documented with impact and owner.

Implementation notes:

- Upgraded direct production dependencies related to the reported advisory chains:
  - `@google/genai` from `^1.50.1` to `^1.52.0`, resolving to `@google/genai@1.52.0`.
  - `@sentry/nextjs` from `^10.58.0` to `^10.60.0`, resolving OpenTelemetry transitive packages to `@opentelemetry/core@2.8.0` and `@opentelemetry/sdk-trace-base@2.8.0`.
  - `@supabase/supabase-js` from `^2.47.10` to `^2.108.2`.
  - `posthog-js` from `^1.378.1` to `^1.393.0`.
  - `tsx` from `^4.21.0` to `^4.22.4`.
- Verified the named production advisory packages now resolve to:
  - `protobufjs@7.6.4` and `ws@8.21.0` through `@google/genai@1.52.0`.
  - `posthog-js@1.393.0`.
  - OpenTelemetry packages through `@sentry/nextjs@10.60.0`, `ai@6.0.97`, and `next@16.2.9`.
- No new package overrides were added; the existing `postcss` override remains unchanged.
- `npm audit --omit=dev --json` reports zero production vulnerabilities: no moderate, high, or critical advisories remain.
- No remaining moderate production advisories require risk acceptance or owner assignment.
- Validation passes:
  - `npm audit --omit=dev`
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`

### 15. Public bucket listing policy review

Status: Complete on 2026-06-24.

Issue: Supabase advisor reports `media` and `audio` public buckets allow object listing via broad SELECT policies.

Required outcome:

- Remove broad object listing policies if public object URLs do not need them.
- Keep object URL access for known assets.

Acceptance criteria:

- Public users cannot list bucket contents.
- Existing image/audio playback still works.

Implementation notes:

- Added and applied `supabase/migrations/20260624090733_restrict_public_bucket_listing.sql` to linked Supabase project `xmuqsgfxuaaophxnwure`.
- Kept the `media` and `audio` buckets public so existing public object URLs continue to work.
- Dropped broad listing-capable storage policies:
  - `Public Access` on `storage.objects`.
  - `Public audio read` on `storage.objects`.
- Preserved scoped admin write policies for media and audio uploads, updates, and deletes.
- Added `npm run security:storage-bucket-listing`, backed by `scripts/security-storage-bucket-listing-check.sql`, to verify:
  - public bucket listing policies do not return,
  - no broad public `SELECT` policy exists for `media` or `audio`,
  - both buckets remain public,
  - expected admin write policies remain present.
- Added static regression coverage in `tests/security/storage-bucket-listing.test.ts`.
- Live direct policy verification shows only the admin media/audio write policies remain for those buckets.
- Supabase security advisors no longer report `public_bucket_allows_listing` for `media` or `audio`.
- Anon storage list checks against `media`, `media/covers`, `audio`, and `audio/generated` return zero object rows.
- Existing sampled public media and audio object URLs return `200`.
- Validation passes:
  - `npm run security:storage-bucket-listing`
  - `npm test -- tests/security/storage-bucket-listing.test.ts`
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`

## P3: Cleanup and Future-Proofing

### 16. Document RLS-enabled tables with no policies

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

Status: Complete on 2026-06-24. Resolved rather than risk-accepted.

Implementation:

- Added and applied `supabase/migrations/20260624093402_document_service_only_analytics_rls.sql` to linked Supabase project `xmuqsgfxuaaophxnwure`.
- Documented the service-only pattern with table comments:
  - `public.content_reading_activity` is a service-only content/date aggregate table.
  - `public.content_reader_daily` is a service-only per-user daily dedupe table.
  - `public.content_reader_visitor_daily` is a service-only anonymous visitor daily dedupe table.
  - `public.segment_embedding_gemini` is also documented as service-only so the new generic RLS sentinel has no current exception.
- Revoked all direct table privileges from `PUBLIC`, `anon`, and `authenticated` on those service-only tables.
- Re-granted only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` to `service_role` for the service/admin paths that need direct table access.
- Added explicit deny-all RLS policies for `anon` and `authenticated`:
  - `Service-only analytics table: deny public access`
  - `Service-only embedding table: deny public access`
- Preserved the existing service-role guarded activity logging RPC model:
  - `increment_reading_activity_for_user(date, integer, uuid)`
  - `log_reading_activity(date, integer, uuid)`
  - `log_anonymous_reading_activity(date, integer, uuid, text)`
  - `log_reading_activity_for_user(date, integer, uuid, uuid)`

Ongoing guardrails:

- Added `npm run security:analytics-rls`, backed by `scripts/security-analytics-rls-check.sql`, to verify:
  - expected service-only tables have RLS enabled,
  - expected deny-all policies exist,
  - public client roles have no effective direct `SELECT`, `INSERT`, `UPDATE`, or `DELETE` privileges,
  - `service_role` retains required direct table privileges,
  - activity logging RPCs are `SECURITY DEFINER`, fixed-search-path, and executable only by `service_role`,
  - no table in the `public` schema has RLS enabled with zero policies.
- Added static regression coverage in `tests/security/analytics-rls.test.ts`.

Verification:

- `npm run security:analytics-rls`
- `npm run security:embedding-table-reads`
- `npm test -- tests/security/analytics-rls.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Direct live SQL confirms the three analytics tables and `segment_embedding_gemini` each have one deny-all policy, no effective `anon`/`authenticated` `SELECT` or `INSERT` privileges, and retained `service_role` `SELECT`/`INSERT` privileges.
- Supabase security advisors no longer report `rls_enabled_no_policy` for the analytics tables.

### 17. Add security gates to CI/deployment

Status: Complete on 2026-06-24.

Required checks:

- `npm audit --omit=dev`
- secret scan excluding known generated caches
- Supabase security advisors
- Supabase `SECURITY DEFINER` ACL drift check with `npm run security:function-acls`
- launch env validation
- tests for public/admin route authorization

Acceptance criteria:

- Production deployment blocks on P0/P1 security regressions.

Implementation notes:

- Added `.github/workflows/security.yml` with a dedicated `security-gate` job for `pull_request`, `push` to `main`, and manual runs.
- Added `npm run security:audit` to block high/critical production dependency advisories:
  - `npm audit --omit=dev --audit-level=high`
- Added `.gitleaks.toml` and a blocking Gitleaks workflow step with full-history checkout.
  - Generated/noisy paths are excluded: `.npm-cache-temp`, `test-results`, `playwright-report`, `.next`, `node_modules`, `coverage`, `dist`, and `build`.
  - Dummy secret allowlists are regex-scoped; source directories such as `scripts/` and `docs/` are not blanket-ignored.
- Added `npm run test:security` to cover:
  - `tests/proxy.test.ts`
  - `tests/security/`
  - `tests/api/health.test.ts`
  - `tests/api/activity-log.test.ts`
  - `tests/api/admin-*.test.ts`
- Updated Supabase SQL drift wrappers to support local PR checks:
  - `SUPABASE_LOCAL=1 npm run security:function-acls`
  - `SUPABASE_LOCAL=1 npm run security:embedding-table-reads`
  - `SUPABASE_LOCAL=1 npm run security:storage-bucket-listing`
  - `SUPABASE_LOCAL=1 npm run security:analytics-rls`
- The CI security gate starts a local Supabase stack and runs `npx supabase db reset` before SQL drift checks. This validates the PR migration state without production database credentials.
- Added `scripts/check-supabase-security-advisors.mjs` and `npm run security:supabase-advisors`.
  - Supabase advisors are treated as scheduled/manual audit because advisor results can lag behind schema changes.
  - The advisor script fails on unallowlisted `WARN`/`ERROR` findings when run.
  - Exact allowlisted findings live in `scripts/supabase-security-advisor-allowlist.json` with owner and review date.
  - Current allowlist covers only the intentional token/email public `SECURITY DEFINER` RPC warnings already guarded by `npm run security:function-acls`.
  - `auth_leaked_password_protection` is not allowlisted.
- Added static regression coverage in `tests/security/security-gates.test.ts`.

Required deployment setting:

- Configure GitHub branch protection or Vercel deployment protection so production deploys require the `Security Validation` job from `.github/workflows/security.yml`.
- Do not use Supabase advisor freshness as the real-time PR blocker; use the local SQL drift checks for that.

Security gate commands:

- `npm run security:audit`
- `npm run validate:launch-env`
- `npm run test:security`
- `SUPABASE_LOCAL=1 npm run security:function-acls`
- `SUPABASE_LOCAL=1 npm run security:embedding-table-reads`
- `SUPABASE_LOCAL=1 npm run security:storage-bucket-listing`
- `SUPABASE_LOCAL=1 npm run security:analytics-rls`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

### 18. Remove tracked local/generated artifacts

Status: Complete on 2026-06-24.

Issue: `.npm-cache-temp` and `test-results` are tracked or present in ways that make security scans noisy and increase repository risk.

Required outcome:

- Remove generated cache artifacts from git.
- Add missing ignore rules for local caches and test outputs.

Acceptance criteria:

- `git ls-files .npm-cache-temp test-results` returns no tracked artifacts.
- Secret scans no longer process generated npm cache contents.

Implementation notes:

- Removed `.npm-cache-temp` and `test-results` from the git index with `git rm -r --cached`.
- Added `.gitignore` rules for:
  - `/.npm-cache-temp/`
  - `/test-results/`
- Kept generated artifact exclusions in `.gitleaks.toml` for:
  - `.npm-cache-temp`
  - `test-results`
  - `playwright-report`
  - `.next`
  - `node_modules`
  - `coverage`
  - `dist`
  - `build`
- Added `tests/security/generated-artifacts.test.ts` to assert the ignore rules, Gitleaks exclusions, and direct `git ls-files .npm-cache-temp test-results` acceptance criterion.

Verification:

- `git ls-files .npm-cache-temp test-results` returns empty output.
- `git check-ignore -v .npm-cache-temp test-results` shows both paths are ignored by `.gitignore`.
- `npm test -- tests/security/generated-artifacts.test.ts`
- `npm run test:security`

### 19. Improve security observability

Status: Completed on 2026-06-24.

Required outcome:

- Alert on repeated auth failures for admin routes.
- Alert on repeated invalid unsubscribe tokens.
- Alert on AI/chat route abuse and rate-limit exhaustion.
- Monitor Supabase advisor regressions.

Acceptance criteria:

- Security-relevant failures produce useful, non-sensitive telemetry.

Implementation:

- Added `lib/server/security-telemetry.ts` as the shared runtime security telemetry helper.
  - Emits structured `console.warn` records for every security signal.
  - Sends Sentry warning events only through an in-memory throttle keyed by signal, route, category, and authenticated user ID or `anonymous`.
  - Does not include raw IPs, hashed IPs, unsubscribe tokens, prompts, request bodies, cookies, authorization headers, API keys, or model output.
- Added `rateLimitFailureResponseWithTelemetry` in `lib/server/rate-limit.ts` so rate-limit response handling can emit security telemetry without per-route duplication.
- Added admin auth failure telemetry through `verifyAdminSession()`, covering admin pages, server actions, and admin API routes that use the shared verifier.
- Added invalid unsubscribe token telemetry for:
  - `app/api/email-subscriptions/unsubscribe/route.ts`
  - `app/api/notification-preferences/request-published/unsubscribe/route.ts`
- Added AI/chat abuse telemetry for rate-limit exhaustion, invalid payloads, oversized conversations, invalid final-message shape, quota exhaustion, and chat export validation failures in:
  - `app/api/chat/route.ts`
  - `app/api/chat/author/route.ts`
  - `app/api/chat/notes/route.ts`
  - `app/api/chat/exports/route.ts`
- Kept Supabase advisor regression monitoring in CI/static audit only through `.github/workflows/security.yml` and `npm run security:supabase-advisors`; runtime telemetry does not import or execute advisor checks.
- Preserved the Next 16 `proxy.ts` convention and added regression coverage for the proxy export and admin matchers instead of adding a deprecated `middleware.ts` wrapper.

Verification:

- `npm test -- tests/security/security-observability.test.ts`
- `npm test -- tests/api/email-subscriptions.test.ts tests/api/chat.test.ts tests/api/author-chat.test.ts tests/api/notes-chat.test.ts tests/api/chat-exports.test.ts tests/proxy.test.ts`
- `npm run test:security`
- `npm run typecheck`
- `npm run lint`

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
