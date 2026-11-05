# Content replacement and reading continuity

## Contract

A catalog lookup is read-only. Missing, hidden, withdrawn, or failed-to-load summaries never authorize automatic bookmark or progress deletion. Saved, Continue Reading, and Completed retain an unavailable entry and its existing section history.

An admin replaces a duplicate from its Edit Content page by choosing the kept published summary, previewing counts, and confirming. The source is soft-deleted and preserved as an archive with immutable content, original segment IDs and artifacts. A durable replacement notice links old reader and preview URLs to the kept version. Notices flatten when a kept version is subsequently replaced. Draft or withdrawn destinations are not exposed.

Personal library rows, highlights, notes, reflections, and local audio bookmarks remain associated with their original summary. Existing progress on the kept summary is never overwritten. No segment mapping, percentage approximation, or audio timestamp transfer is inferred. The notice links to original Notes using the account/content-scoped queries for highlights and reflections. This is not a public archive reader.

Replacement checks both preview timestamps under transaction locks and rejects a source with narration in progress. A retry of the same committed replacement is idempotent. Permanent deletion is blocked while personal library/capture records remain; replacement foreign keys also prevent purging either linked edition. There is no new automatic purge or restore operation.

## Existing affected readers

Recovery is separate from prevention. Identify the original and kept summary IDs and the backup, inspect retained records, and prepare a recovery diff before any live write. Never overwrite newer progress on the kept summary. A backup containing only content cannot recover missing personal records or browser-only listening positions.

## Verification and release checkpoint — 22 October 2026

Implementation commit: `d2d3dc33`. Branch: `codex/content-continuity`, based on `origin/main` at `bdfe353c`. Worktree: `/Users/j/Desktop/Lifebook-content-continuity`.

The additive migration is `20261022021946_content_replacements_preserve_history.sql`. Public table access is limited to a replacement notice with an available published destination; all replacement writes use the service-only RPC behind the existing admin session check. Trigger helpers live in the private schema and have no browser-role execution grant.

Local disposable Supabase: `/tmp/netflux-content-continuity-db`, API port 58321, database port 58322. Synthetic fixtures only. Full migration replay passed. Initial runtime proofs preserved both versions' personal state, refused stale previews, froze archived text, blocked permanent deletion, flattened later replacements, and enforced notice permissions. One setup timeout during overlapping checks passed on focused retry. Generated types for the new objects were taken from the replayed schema.

Final evidence with the branch's own lockfile dependencies (Next.js 16.4.0):

- Full bounded Vitest run: 243 files passed, 9 skipped; 1,816 tests passed, 277 skipped. Skipped provider/database suites are not verified coverage.
- Final focused run after the narration guard: 18 tests passed, including all 7 disposable database runtime cases.
- Capacity harness: 34 tests passed.
- Full lint, typecheck, whitespace and 114-migration uniqueness checks passed.
- Production build, five Sharp dependency traces and critical CSS checks passed.
- Public-object, admin-RPC and function ACL SQL audits passed against the local replayed schema.
- The actual production application passed the admin preview/confirm → library unavailable record → old-link notice journey at desktop 1440×900 and mobile 375×667. Both browser checks passed in 10.6 seconds. Original guest progress, kept-version progress and original local audio offset were verified independently; no horizontal overflow was observed.

An initial broad test run overlapped browser checks and timed out; it was stopped, not accepted as passing evidence. One runtime fixture setup timeout passed in a focused retry. Initial use of the primary checkout's older dependencies was replaced by an isolated lockfile install. The first build caught missing explicit test-cookie types; after that correction a test-output-directory configuration caused the standard trace script to inspect the wrong directory. The normal production build passed with the standard output directory. The development server accepted connections but did not serve pages in two attempts, so browser verification used the built app instead, with local Redis behind a disposable REST bridge and the normal loopback admin IP allowlist. None of these setup failures was relabeled as a pass.

No production database, reader records, or backup has been modified. Hosted disposable verification and the reviewed production dry-run remain required by OPS §2.2 before promotion. Production migration requires explicit authorization. Affected titles and backup path have been requested; recovery is pending identification.

Next action: finish review of [PR #274](https://github.com/Jseow008/ThePlayBook/pull/274), choose the organization for required disposable hosted verification, then complete OPS §2.2 and obtain explicit production-migration authorization. Do not promote before that gate passes. Recover existing reader history only after the affected summary IDs and backup are identified.

One agent; approximately 30 minutes through local verification and PR preparation. No external generation-provider calls or comparative cost measurement; token usage unavailable. The primary checkout was left on its existing branch. Temporary local services are stopped after verification; the isolated worktree and source remain available for the hosted gate.


## Review corrections — 22 October 2026

The owner confirmed three gaps at `8fb698ac`; correction implementation `e40f1ccb` addresses all three on the existing PR branch:

- Series deletion may perform only the foreign key's detach of an archived edition. The trigger verifies the former parent is gone and all non-series/non-timestamp fields are unchanged, clears the paired ordinal, and continues to reject manual detachment, reassignment and content edits. The unreleased migration was corrected in place; no production migration was applied.
- Original-summary Notes links now use the existing per-content reflection endpoint. Reflections remain visible under the summary filter and the Reflections tab, even when the catalog join is null for an archived source. Broader reflection text/color/sort search remains outside this change.
- Unavailable entries expose Remove from Saved or Hide from Continue Reading/Completed through the existing mutation/archive hooks, with Undo. These explicit actions preserve progress, notes and audio positions; catalog reads remain non-destructive.

Fresh evidence: 44 focused component/API tests plus all 10 full-schema disposable database runtime tests passed. The complete 114-migration local replay, three SQL permission audits, lint, types, production build/Sharp/CSS checks, migration uniqueness and whitespace checks passed. The extended actual-production-app journey passed on desktop and mobile in 17.4 seconds: it checks the scoped reflection API response and both reflection views, all three list actions, archive Undo, and retained reading/audio state. The first browser run found an ambiguous test selector shared by available and unavailable cards; scoping it to the unavailable section corrected the test without changing product behavior. No production data changed. This is local verification, not the required disposable hosted gate.

The earlier 1,816-test run belongs to the initial candidate; the correction evidence above is the current affected-check evidence. Single agent; no provider calls or token-usage measurement. Hosted organization choice and the original affected IDs/backup remain pending.


## Independent correction verification — 22 October 2026

Reviewed PR #274 head `d32287372ed8635f8969d932a044c88e70348757` in the same worktree and branch. No implementation changes. Thirty component/API tests passed (BrainClientPage, LibraryUnavailableHistory, ContentReplacementNotice, admin-content-replacement); all ten database runtime tests passed against the restored full-schema local disposable instance. The database tests cover archived-only and genuinely empty series deletion, preserved personal state and segments, and rejected manual detachment/content edits.

A fresh synthetic signed-in account on the existing built local app verified the original link and Reflections filter, excluding unrelated reflections. Desktop Continue Reading and Completed Hide → Undo → reload restored their entries. Healthy Saved Remove → Undo → reload restored the bookmark. Mobile at a measured 390px viewport displayed the controls without horizontal overflow, accepted Remove, and displayed the original reflection under its content/type filters. Mobile Undo was not separately completed: its notification expired before activation. Unchanged earlier mobile journey evidence remains separate.

Test setup initially used a database login unable to assume the snapshot-worker role; restarting the local app with the appropriate local administrator connection resolved it without schema changes. Repeated reloads later reached the local six-per-hour snapshot limit. Rapid automated Undo attempts landed on the adjacent moving Refresh notification and are not accepted as evidence of a product Undo defect. A fresh-state explicit Undo activation restored the entry and survived reload under rate limiting. This does not establish broader sync recovery correctness. Final read-only fixture inspection found all three server bookmarks, original section counts and all three reflections intact.

Synthetic account/content removed; temporary Redis bridge, app and disposable Supabase services stopped; browser viewport reset. Evidence screenshots: `/tmp/review274-saved-undo.png` and `/tmp/review274-mobile-reflection.png` (local ephemeral evidence). Only this checkpoint was edited. One agent, roughly 15 minutes; no provider calls; token usage unavailable.

Verdict: the three original findings are verified corrected within these checks. Hosted verification has not run. Next action remains choosing the hosted organization and completing OPS §2.2 before release; no merge, deployment or production migration was performed.


## Hosted release verification — 22 October 2026 (blocked)

Candidate: `d32287372ed8635f8969d932a044c88e70348757`, PR #274, branch/worktree unchanged. Authorized disposable project `dlmnkpysniwfxyymftmb` (`netflux-pr274-verification`) was created in Jseow008, ap-south-1. Its ref was checked against production `xmuqsgfxuaaophxnwure`; only the isolated temporary workdir was linked to it. Production was used for read-only schema/type/advisor comparison.

Passing evidence:
- All 114 migrations pushed to the hosted candidate, followed by a guarded full reset/replay; final candidate dry-run reported up to date.
- Schema inventory showed only the intended replacement table, columns, constraints, indexes, policy, ACLs, three functions and four triggers. No existing definition changed or disappeared. Generated public types differed only by the replacement table/RPC and known PostgREST version metadata (14.1 versus 14.18). This is reviewed additive difference, not exact production parity before migration.
- All five repository security SQL audits passed on the hosted candidate. Security advisory findings matched the existing private-table deny-by-default and public catalog search patterns; the production leaked-password warning remains a separate existing control. Candidate performance advisory findings were unused indexes on the empty fixture database and absolute Auth connection allocation, not a new missing-index warning.
- All 10 content-continuity database runtime tests passed on hosted Postgres. The isolated candidate production build, TypeScript build checks, Sharp traces and critical CSS check passed.
- Browser checks covered login, Browse, Reader, anonymous admin denial and synthetic admin access. HTTP checks covered missing-code rejection and shallow/detailed health. Missing-code HTTP verification used a non-allowlisted forwarded host to exercise the configured-origin fallback; direct localhost forwarding otherwise chooses HTTPS, which the local server does not serve. These were equivalent manual/HTTP smoke checks, not execution of the mandated seven-test Playwright runner. Detailed health used synthetic provider/monitoring configuration; external AI/Sentry functionality was not exercised.
- Hosted admin preview/confirm preserved one original library row and reflection; the old reader link showed the retained reflection, including the Reflections filter. Continue Reading Hide → Undo → reload preserved 1/4 sections, and final hosted queries found both bookmarks, both section histories and both reflections intact. Two short browser waits expired during loading; subsequent observations confirmed the final states.

Blocking finding: the unchanged required DB-002 runner fails at `scripts/database-highlight-preservation-check.sql:356`. Cleanup deletes the synthetic content before its synthetic user, so the new personal-history protection correctly raises `Summary has personal records; archive or replace it instead of permanently deleting it`. A temporary copy that only reverses those two cleanup deletions passed every assertion on the same hosted schema. The checked-in test was not changed, and its failed result is not marked passed. Next implementation action is a test-fixture cleanup correction, then rerun the required DB-002 check and exact smoke runner before declaring the release gate clear. No production dry-run, backup freshness check or production migration authorization was completed after this blocker.

Setup failures were retained: the first build used a dependency symlink rejected by Turbopack (resolved with an isolated dependency copy); initial direct database credentials were not valid because hosted privileged passwords cannot be changed through that SQL connection (resolved through the candidate-only management password API); one SQL invocation used paths relative to the isolated workdir (rerun with absolute paths); the CLI rejected the node-postgres-specific TLS mode in the initial DB-002 invocation (rerun using libpq `require`). None was accepted as product evidence.

Cleanup: deleted the disposable hosted project and confirmed the project listing contains only production. Stopped the isolated app and Redis bridge/container; removed the private copied app, credentials, fixtures, generated types and workdir. Sanitized evidence remains at `/Users/j/.codex/artifacts/pr274-release-verification-20261022`. No product code or production data changed; only this checkpoint is edited locally and has not been pushed. Single agent; roughly 35 minutes; no generation-provider calls; token usage unavailable. Release verdict: HOLD until the required verification script and runner pass.

## Hosted verification gaps closed — 22 October 2026

User authorized the test-only cleanup correction and exact automated smoke suite. Candidate application/migration remains `d32287372ed8635f8969d932a044c88e70348757`; this follow-up changes only the DB-002 fixture cleanup and this evidence document, on `codex/content-continuity` in `/Users/j/Desktop/Lifebook-content-continuity`. DB-002 now deletes the synthetic user (and cascading personal records) before deleting its protected content. All behavior assertions remain unchanged.

Created fresh disposable project `owhtzfmigrbpopgqowsl` in the previously authorized Jseow008 organization, ap-south-1. The isolated link was verified against that ref and against production `xmuqsgfxuaaophxnwure` before schema replay. All 114 migrations replayed successfully. The unchanged schema/reset, security, type comparison and ten continuity runtime results from the earlier hosted run remain applicable; this bounded follow-up reran the affected DB-002 proof and missing exact smoke runner.

- The checked-in `npm run database:highlight-preservation` passed on the hosted candidate (exit 0, DO completed), including cleanup.
- Fresh candidate-configured production build passed, including TypeScript build validation, five Sharp traces and critical CSS.
- The exact `tests/e2e/production-smoke.spec.ts` passed **7/7, no skips or retries**, desktop Chromium, in 6.3 seconds. All optional smoke variables were populated with synthetic admin/content credentials. Test source and assertions were unchanged. A temporary config added loopback forwarded-host/client-IP headers so local HTTP exercises the configured-origin callback fallback rather than an unavailable local HTTPS endpoint. This verifies the built app against hosted Supabase, not a public production deployment. Synthetic external-provider/monitoring configuration was present for readiness; those external services were not exercised.
- Whitespace check passed. No TypeScript verification source changed; lint is not applicable to the SQL-only correction.

Deleted the disposable project and confirmed the project list contains only production. Stopped the isolated app and Redis bridge/container; removed the private copied app, credentials, fixtures and workdir. Sanitized logs retained under `/Users/j/.codex/artifacts/pr274-release-verification-20261022/final-{db002,smoke,build}.log`. No production data or product code changed. One agent; approximately 6 minutes for this follow-up; no provider calls; token usage unavailable.

The two outstanding hosted-verification gaps are closed. PR #274 remains unmerged with auto-merge disabled. Next release action: verify production backup freshness and migration parity, review the exact production dry-run list, and obtain explicit authorization for that list before any production migration or promotion. Original affected reader-history IDs and backup location remain a separate unresolved recovery task.

## Production release authorized — 22 October 2026

Owner explicitly waived completion of the remaining production checks and requested release: “No need to finish production checks as no one uses our website, proceed with releasing 274 and make it in production.” The exception and unverified backup-freshness risk were recorded in the PR before any production change. A read-only production dry-run nevertheless confirmed the exact scope is only `20261022021946_content_replacements_preserve_history.sql`. This authorizes that PR's release; it is not evidence that the waived checks passed.

Required Security Validation exposed a separate stale DB-103 expectation: 64 public RLS policies, while this migration adds the reviewed replacement-notice policy. Owner explicitly approved correcting the expectation to 65 and continuing release. All permission checks are retained. Product/migration implementation remains unchanged. Pending: policy-matrix rerun, required CI, production migration, merge and deployment identity confirmation. No production migration applied at this checkpoint.

The complete DB-103 role matrix passed against the restored disposable local database with the corrected count, ending in ROLLBACK. No role or permission assertion was removed. Production dry-run scope is one migration; the database mutation will be applied only for the authorized #274 release.

Production migration `20261022021946_content_replacements_preserve_history.sql` applied successfully to `xmuqsgfxuaaophxnwure`; subsequent dry-run reports up to date. No replacement operation or personal-record deletion was performed. Required PR scope passed and squash auto-merge is enabled at `d1b6cd53`, pending remaining CI. Production still served #273 when last inspected. Exact next action: wait for required CI, confirm merge and Vercel production deployment identity, then record the result. Production backup freshness remains unverified under the owner's recorded exception.

CI at `d1b6cd53` exposed the companion unit test's old count plus pre-existing database fixtures that deleted protected content before personal records. The approved test correction was completed across the companion assertion and affected cleanup hooks; the old content-deletion assertion now verifies rejection, retained library state and unchanged revision. Product/migration SQL is unchanged. A focused local run passed all five affected test files: 235 tests passed, one skipped; lint and typecheck passed. The skipped case is not claimed as verified. CI must rerun before merge.

## Catalog advisor remediation — 5 November 2026

Owner approved separate security changes: deploy the compatible server search
caller before restricting direct database access, enable leaked-password
protection, verify both, and keep #320 on hold. This branch
`codex/catalog-search-server-access`, worktree
`/Users/j/.codex/workspaces/netflux-catalog-search-security`, starts from fresh
main `232e104a680207eaa8228a1f408d99a85109f7f4` (#319). It does not contain #320.
The earlier investigation and #320 hosted evidence remain in that task's
uncommitted `docs/CONTENT_CONTINUITY.md` checkpoint and sanitized task artifacts.

Stage1 changes only the fixed catalog RPC caller to the existing server service
credential, with an explicit `server-only` import boundary. The earlier report
called this module server-only because its consumers were on the server; it
lacked the explicit import, which this change now adds. Result projection,
normalization, cursors, ranking, caching, public UI, and account-bound Notes
search remain unchanged. Existing live RPC already permits service_role, so this
application stage is compatible with both sides of the later ACL restriction.
Do not revoke browser execution until the exact server caller is live.

Prepared an isolated hosted project `xlhrenvtpwmxmnlzuler`,
`netflux-catalog-security-verification-20261105`, in the already approved Jseow008
organization/region for the security rehearsal. The connector create call
succeeded without requesting a new confirmation ID. It must be deleted after
verification, including on failure. Production remains `xmuqsgfxuaaophxnwure`.
Only a private isolated CLI workdir is linked to the candidate. Baseline migration
replay passed. Stage1 focused tests11/11, typecheck and full lint/ratchets passed;
full unit suite, hosted schema/app proof and required CI still pending.

Setup failure retained: first pooler-metadata URL omitted `/config` and returned
404 before private fixture initialization. Dependent CLI calls consequently
failed without a fixture file; none reached a database mutation. Used the
documented endpoint, reinitialized only the disposable password, linked the
isolated workdir and replayed baseline successfully. No production password,
schema, setting, grant, account or content change at this checkpoint.

Next: verify the hosted application baseline and prepared restriction; publish
stage1 PR with release hold until its app gate and required checks pass. Prepare
a separate ACL migration/PR and reviewed exact production dry-run, then obtain
the exact-list approval required by OPS before that database mutation. The
explicit user authorization covers enabling leaked-password protection; verify
it with synthetic data first. Do not change password length/complexity,
authentication methods, account sessions or #320 release state.

Stage1 hosted baseline matched production in all14 fingerprint categories.
Production build passed, including Sharp/critical CSS. Real Chrome showed the
same20 results signed out/in, next page5 results, exact previous-page return,
and no private-note or draft/retired result. Login, missing-code callback,
Browse, public read (after expanding the normally collapsed section), anonymous
admin denial and synthetic admin login passed; shallow/detailed health200/ok
with reachable hosted DB. API proof found all25 expected IDs exactly once and
the second synthetic account saw only its own thought. No provider calls.
The reader's initial exact-text probe ran before expanding its section and
failed; the correct visible entry point then passed. A library-sync warning is
retained as a fixture limitation (snapshot worker not configured), not search
coverage. No completion or existing production content was changed.

Stage1 full unit suite2,139 passed/307 skipped; all34 capacity harness cases
passed. A review caught the separate catalog CI evidence job still exporting
only the anon fixture key. Updated that job to export its ephemeral service key
and its route harness to use it; this is required by the changed caller and
does not inject production credentials or weaken a check. Final affected
contract/security tests18/18 and typecheck/lint passed. PR #321 first candidate
`d47e0b01` is superseded by this necessary fixture correction; required gates
must run on the corrected head. Auto-merge stays off until hosted proof and scope
review are attached. Stage2 remains separate and must wait for the live caller.

Second fixture correction before release: the main validate browser job also
exported only the disposable public URL/key. Its search paths now need the
service credential, so export that third exact local variable and require all
three lines. The separate catalog evidence job was corrected earlier; missing
this second consumer caused an unnecessary CI attempt. Hosted/product evidence
is unchanged. This is a necessary fixture correction, not a relaxed assertion or
an unchanged retry. No production credentials enter CI. Required gates must run
on the new head; do not infer their outcome from earlier security successes.

### Stage2 restriction prepared; ordered production rollout pending

Branch `codex/catalog-search-rpc-restriction`, worktree
`/Users/j/.codex/workspaces/netflux-catalog-search-restriction`, intentionally
stacks on #321 at `ad75b5af9ef3c0432e4590fa8b2b142be21f67cc`. New migration
`20261105094614_restrict_catalog_search_to_server.sql` adds a signed service-role
guard to the exact existing search body and revokes PUBLIC/anon/authenticated
execution, retaining service_role. A regression compares the remaining body
exactly with the original. Existing published-only projection, ranking,
pagination, index privacy and Notes RLS are preserved. ACL checks remove the
public exception and now require the general service-role guard/browser denials.
No advisor exception or schema/type expansion.

Hosted results for this restriction:19 focused contract/module/security tests
passed;5 catalog/Notes runtime cases passed,1 performance case skipped locally
(the unchanged required CI performance job still runs). Raw SQL pool startup
options did not establish JWT claims through the hosted pooler; the harness now
uses its supported awaited onConnect query, and explicitly restores account
claims in browser-role probes. The configured pool still has2 connections.
Ten SQL ACL/RLS/invariant checks passed. Real HTTP direct RPC returned401 anon /
403 authenticated, both42501, while the unchanged production build returned the
exact same25 public IDs, snippets, ranks and next/previous cursors before/after.
Second account read only its own private thought; public search excluded both
private thoughts and draft/retired records. Chrome search also matched exactly
after restriction.83 public build files contained no service key.

Fresh candidate/production public types match exactly after only PostgREST
platform-version normalization. Full hosted reset/replay matched all14 pre-reset
schema categories, left zero auth users/content, and final dry-run was clean.
Strict hosted security advisor script passed with12 INFOs and zero WARN/ERROR;
the existing private RLS/no-policy INFOs intentionally deny browser access.
Preserve all skipped-test/device limitations; no broad benchmark or provider call
was used for this hosted proof. Required CI/performance gates still apply.

Leaked-password protection was enabled and behavior-tested on the candidate:
known pwned password rejected422; strong update and sign-in200. Then applied
only the user-approved password_hibp_enabled=true setting to production.
Reviewed email/Google/signup/password-length/reauthentication settings stayed
unchanged. First production attempt failed its rejection assertion; its response
shape was not retained, so its cause remains unknown (do not attribute it to
propagation as fact). The test account was signed out and deleted. A subsequent
diagnostic attempt, without another setting update, recorded422 with reason
pwned, strong update200 and subsequent login200. That second account was also
signed out globally, deleted and independently confirmed404. No real user's
password/session/profile or content was changed. No email-delivery or external
Google OAuth login claim is made. Temporary candidate Auth enabling also had an
initial immediate configuration-comparison failure; a later read/behavior proof
confirmed enabled. These failed attempts remain recorded, not relabelled passed.

Production read-only dry-run, in a separate workdir linked only to
`xmuqsgfxuaaophxnwure`, lists exactly
`20261105094614_restrict_catalog_search_to_server.sql`; no #320 migration.
Supabase reports completed physical backup2026-11-04T23:49:55.369Z, under24h old
for this permission-only mutation; PITR is off. No new backup purchase inferred.
Production search grants are NOT yet changed. Release order is #321 required
checks → protected merge → READY production/public-alias identity and search
check → explicit exact-list migration approval → permission change/parity/access
and advisor checks → #322 protected merge. Keep #320 held throughout. The
user's general rollout instruction does not skip OPS's exact-list decision.

Artifacts are sanitized under the task's `catalog-security/` directory. Candidate
`xlhrenvtpwmxmnlzuler` must be deleted and local processes/container/secrets/tabs
cleaned before completing this verification; reset already removed its fixtures.
No production catalog rows, private notes, #320 migration or matching rules have
changed. One agent; application-provider usage zero; Codex billing unavailable.

### Exact migration authorization and cleanup

Owner explicitly approved applying only
`20261105094614_restrict_catalog_search_to_server.sql` after #321 is live and
the required gates pass. This supersedes the pending exact-list decision above;
it does not authorize #320's migration or bypass any gate. #321 head
`ad75b5af9ef3c0432e4590fa8b2b142be21f67cc` has protected squash auto-merge enabled
after clean scope inspection and hosted proof. Security Validation and Catalog
Search Evidence passed; validate is still in its browser step. Stage2 PR #322
head `923a50d5947927954bf47b70a7d7407d9a5af6eb` is open/held with stacked-pr label
and parent #321. Its required checks are running; do not enable auto-merge before
the ordered production restriction is verified.

Candidate project `xlhrenvtpwmxmnlzuler` deleted by CLI; fresh connector inventory
confirmed absence and production still present. Full reset had already removed
all synthetic auth/content rows. Closed only the test-created Chrome tab,
stopped owned app/ingress/REST processes, removed the labelled Redis container,
and confirmed no listeners on3440/3441/3442. Removed candidate environment,
generated build, keys/passwords, isolated candidate CLI state and fixture
helpers. No exact candidate keychain item remained; global CLI login untouched.
Production disposable users were already deleted/confirmed404. Sanitized proofs
and screenshot remain under task artifacts `catalog-security/`. The separate
production read-only CLI workdir is retained only for the approved rollout.

Candidate performance advisor had unused-index INFO62 on the freshly reset
empty database plus auth connection-count INFO1, zero WARN/ERROR and no
unindexed-FK finding. Only function_definition/function_acl fingerprints changed
from baseline; index/schema design did not change. Before #321 release, public
alias resolved to READY production `dpl_TuXchSoEoAySegvFxtbbD98aMt53`, main
`232e104a680207eaa8228a1f408d99a85109f7f4`. Next: finish normal #321 gates,
verify its new READY deployment and public alias/search, refresh #322 onto merged
main without changing the reviewed application/SQL tree, require final gates,
reconfirm exact production dry-run and apply the approved single migration.

Latest stage1 head is `0ab10134b1e41ff3272a70187556420531dc83fd` (application
source identical to the hosted build). In addition to the separate catalog
evidence job, the main CI browser job needed its own ephemeral service-key
export. Its old run42006126202 finished with12 search failures across six
viewports,200 passes/118 skips; do not label that run passed or merely cancelled.
The missing credential prevented normal search/empty-result states. Corrected
only that fixture export and its exact three-variable count; synthetic extraction
check and18 focused tests passed. Final CI42009280885 and security42009280666
are running; PR scope and Catalog Search Evidence passed at the corrected head.
Protected auto-merge remains enabled only for #321. #322 must refresh onto the
actual merged main (which has strict required-current-base rules) before its
final release; its old-head hosted SQL evidence is reusable because the reviewed
SQL/application body is unchanged. Do not repeat paid hosted verification for
CI credential wiring or Git ancestry alone. No new resource remains running.

### Consolidated ordered release candidate

The approved application and permission changes are consolidated in #321 to
avoid a strict-base stacked-PR refresh starting another full CI cycle after the
caller merges. #322 becomes a superseded review reference. This changes release
packaging only: the exact approved migration/hash and application source are
unchanged. The only cherry-pick conflict was overlapping checkpoint appendices,
resolved by retaining both records. No product/SQL merge conflict.

The production build does not apply migrations automatically (verified package
scripts/workflows). Thus #321 can deploy its compatible caller while the old
RPC grants remain, and the separately approved single migration is applied only
after that build is READY on the public alias and every final gate passes.
The owner's condition “after #321 is live and the required checks pass” remains
fully enforced. No new approval, paid resource, API behavior or scope change.
#320 remains OPEN/unmerged with auto-merge off. All earlier intermediate PR/head
status paragraphs are historical, superseded by this consolidated candidate.
