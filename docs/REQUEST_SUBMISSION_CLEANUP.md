# Summary request cleanup checkpoint

## Access control

Branch codex/private-summary-requests, based on 982b9feb.
The migration removes the public request SELECT policy and PUBLIC/anon/authenticated table privileges. Service and snapshot-worker access is retained. Data and notification interest records are untouched.
Submission acknowledgements contain only the current submitted title, duplicate flag and interest flag. Retired vote endpoints return 410 without querying requests.

An isolated postgres:15-alpine container with synthetic two-account rows passed public/account read denial, service reads, scoped snapshot reads and unchanged history checks using the exact migration. Container removed. This is a focused privilege rehearsal, not a full hosted schema replay.
Production migration has not been applied. Required CI/security checks and the repository's disposable hosted database verification remain release prerequisites. No paid resources created.

## Submission cleanup

Pending on the access-control change. Remove external metadata and cover enrichment, retain explicit format, source URL, duplicate and notification behavior. Keep hidden-request deduplication semantics under an admin “Exclude from matching” label. Browser coverage and final validation to be recorded before handoff.

The first hosted security gate found remaining legacy browser write privileges after SELECT revocation. The migration now revokes all table privileges from PUBLIC, anon and authenticated. This is within the private-request boundary. Required gates rerun on this correction.

## Cleanup verification

Branch codex/simplify-request-submission stacks on access PR #368.
Removed metadata transport and book-cover enrichment and their obsolete tests. Explicit Book/Video selection governs the stored format. URL labels use submitted text (stored title bounded to the existing 300-character database limit); the full source URL is retained. Confirmations use the exact submitted text, including after a duplicate.
Retained hidden-row duplicate semantics under “Duplicate matching” controls. Interest storage, notification recipient selection and export SQL remain in place. Old thumbnail columns/data remain.

Local verification: 32 focused tests passed; the full run reported 2456 passed/318 skipped, plus 34 capacity-harness passes. Full lint and TypeScript passed. Early test failures came from assertions expecting an enriched response title and an obsolete removed-module import; corrected to the submitted-label behavior, then focused tests passed.
Chrome local component harness with controlled auth and submission responses verified desktop success, duplicate acknowledgement with newer text preserved, and 390px URL success/failure recovery with no horizontal overflow. Uses existing generated CSS; does not verify the full Next.js shell, real sign-in, publishing email delivery, physical phones or Safari. Harness tab closed and viewport restored. No production writes or paid resources.
Release remains held for parent database verification and final CI/security checks. Do not infer passing hosted/deployed journeys from component checks.
CI correction: the catalog guard now expects 64 public-schema policies after removal of the retired request-board policy, and explicitly rejects any request read policy applying to public/browser roles. Existing snapshot/service policies remain required by the other access checks.

CI recovery for #369: startup now probes the configured database port only in GitHub Actions. If occupied, it selects an available OS-assigned port and updates only the runner's [db] port before invoking the unchanged CLI startup/health checks. Subsequent status/reset commands read that config. Local and production settings are untouched. The unknown occupant is not terminated. A real listening-socket regression verifies fallback and preservation of API/studio/shadow ports; image preload and failure/cancellation tests remain enforced.
The first attempt to merge the parent guard correction conflicted only in this checkpoint; both evidence sections were retained. Required checks rerun after publishing; no release gate is bypassed.
Remaining test expectations corrected: the unit guard now expects 64 policies; the SQL role matrix expects permission denial for anonymous, owner and second-account direct request reads. Explicit service-role assertions retain access to both request history and notification interest. Eight focused tests passed. Five exact SQL assertion blocks from the role matrix passed against synthetic PostgreSQL rows using the reviewed migration; disposable container removed. The first fixture connection preceded PostgreSQL readiness; it succeeded after readiness was confirmed. Full hosted role-matrix CI remains required.

## Podcast and Article requests

Branch `codex/request-podcast-article` in `/tmp/netflux-request-form` extends the request form, sign-in drafts, Search prefill and submission validation to all four catalog formats. The existing database function and admin queue already support the two added formats. Chrome verified the Podcast Search handoff at 390 px and Article at 1440 px. All 73 focused tests and TypeScript passed. Both formats were submitted and read back using the existing local database function in a rolled-back transaction. Next step is the gated application release.
