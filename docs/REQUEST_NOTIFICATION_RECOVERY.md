# Request publishing notification recovery

## Candidate and release hold

Branch `codex/request-notification-recovery`, worktree `/Users/j/.codex/workspaces/netflux-request-notification-recovery`, independently based on main `ec654d7a2bb4693aeca2abf152745b4072c51a6e`. This fixes existing publishing behavior; it does not include the access-control or submission-cleanup changes in #368/#369. Both remain open and held. No production database changes or emails authorized/performed by this implementation task.

## Implemented scope

- Forward migration `20261115070045_repair_request_notification_queue.sql` explicitly casts the DISTINCT publication literal to the notification enum. Keep the existing queue signature, recipient selection, preferences, uniqueness, search path and service-only execution.
- An explicit save of a linked published request reattempts enqueue, including an already-published request. Existing recipient rows are not replaced or reset. Only newly inserted rows trigger the existing background processor. This is a single-request admin recovery action, not an automatic historical backfill.
- A queue failure leaves the successful request save intact and returns an amber alert explaining how to retry. Suppress the ordinary green success notice in that case. A successful retry clears the warning.
- A read-only, service-only SECURITY INVOKER count reports eligible published-request interests with no outbox row. Exclude opted-out recipients and missing email addresses. Admin health cannot report Healthy while this count is nonzero. If the count query fails, propagate the failure rather than inventing zero.
- No accounting, provider, delivery-idempotency, opt-out policy, public submission, account history or layout changes. No historical email backfill is included.

## Verification

- Fifteen focused action, health-page and processor tests passed. Cover failed enqueue after persisted publication, repeated failure, saving the already-published request to retry, clearing warnings, no processor launch on zero newly queued rows, non-published requests, empty outbox with missing enqueue, error propagation and provider-free opt-out skipping. Opted-in processor test uses a mocked provider and retains its existing idempotency key.
- Four real SQL runtime tests passed on isolated Supabase PostgreSQL 17.6 with synthetic minimal dependencies and the actual original plus new notification migrations: first enqueue and repeat, sent-row/token/opt-out preservation, six concurrent requests producing two total notification rows, browser-role denial/session guard, eligible missing-count filtering. This is not a full-schema or hosted rehearsal. The same runtime test is now required in Security Validation against its fully replayed disposable Supabase schema.
- Controlled browser check of the actual form component and production CSS at 1440, 390 and 320 px passed: warning visible/contained, no horizontal overflow, retry usable, successful response clears warning. Save responses were controlled in a disposable Vite harness. This is not authenticated Next.js or hosted integration evidence.
- Type checking and targeted lint passed. Local security suite: 206 tests passed. Capacity harness: 34 tests passed.
- Full default local suite: 2485 passed, 322 skipped, four 5-second timeouts in unchanged ReaderView, NotesAskPanel.session-readiness and PreviewAppearanceMenu tests. All three files (111 tests) passed in a single-worker isolation run, without timeout changes. This supports contention as a possibility; it does not erase the failed full run or replace required CI. Skipped tests remain outside verified coverage.
- Full lint passed, including the type-safety, revalidation, route-shell and dependency-isolation checks. Hosted CI is still required. Phones, Safari, real email delivery, final hosted schema/types/security/application rehearsal and production behavior remain unverified.

## Failed setup attempts and cleanup

The new server mock initially lacked an existing gte chain method; completed the mock and focused tests passed. The isolated database initially rejected Docker-bridge traffic; configured only this disposable instance, bound to host loopback, then the SQL runtime tests passed. Browser probe setup initially skipped JSX transformation for a virtual module; inspection identified Vite 8's Oxc transformation requirement, corrected the test harness, then all viewport checks passed. No product fix was derived from these setup errors.

Removed the disposable local database container, browser tab, UI probe server and temporary probe script. No paid resource, production fixture or live provider call was created for this implementation. Logs are sanitized local files under `/tmp/netflux-notification-*`; no credentials or private content are recorded.

## Remaining release work

The earlier hosted project was deleted as requested. A fresh Supabase quote is $10/month for a replacement project in Jseow008; no prorated total was provided. Creation needs fresh cost approval before it occurs. Use synthetic fixtures only and delete the project afterward. Repeat affected notification checks and complete the outstanding account-history/application checks against the final integrated candidate; retain unaffected evidence only when inputs are unchanged.

Release order: obtain passing required CI/security and complete the hosted gate; review production backup/migration parity and exact dry-run; obtain explicit production authorization; apply the reviewed migration before deploying this app code (it requires the new health RPC). Refresh #368/#369 after the independent correction and revalidate their affected integration. Do not enable auto-merge or apply any production migration while this hold remains. Next action: publish this separate PR, report current check state, and obtain the replacement-project cost decision.

## Hosted follow-up and retry correction

User approved the replacement $10/month quote. Temporary hosted project gpfclpwkmymqovsmmwei is active for synthetic verification. Integrated initial candidate 4836ac8158c7102375d37663e6865af2dff8f267 combines #372/#368/#369. Replay, security SQL, generated types (only new health RPC plus platform metadata), four fully replayed hosted notification runtime tests and scoped account-history/export checks passed. Certificate-verified worker login resolved the previous hosted history limitation. Initial browser smoke passed 5/7 because of local HTTP callback-origin and missing admin-allowlist configuration; corrected isolated setup passed all seven checks.

Hosted admin-browser failure retained: React's automatic native form reset reverted selected Published status and linked destination to old Pending/empty defaults after the warning. Clicking Save again therefore saved Pending and created no outbox rows. Added a regression that failed with the same selected-value reset. An onReset cancellation attempt also failed this regression. Hydrated submit now dispatches the existing action inside a transition, retaining the action attribute for progressive enhancement and the action's pending state for the button. This prevents native reset of the edit form and preserves its exact status/destination/note values for retry.

The final code must be rebuilt and the affected desktop/narrow admin journey repeated against the same disposable hosted project. Keep all PRs held until that evidence and final required gates pass. Cleanup is pending while the authorized rehearsal is active; no production data or emails changed.
