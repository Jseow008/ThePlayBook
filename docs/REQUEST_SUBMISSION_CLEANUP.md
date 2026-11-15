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
