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


## Publish updated version — implementation checkpoint, 5 November 2026

- Worktree: `/Users/j/.codex/workspaces/netflux-publish-updated-version`.
  Branch: `codex/publish-updated-version`, intentionally stacked on #319,
  parent `182e5b38fca69874f216f9a6c493427b198c60da`.
- Scope: create/resume a separate edition draft from the persisted published
  graph; save/review it privately; atomically retire the original and publish
  its successor through `admin_replace_content`. Preserve original section
  IDs/text, highlights, thoughts, reflections and reading/listening records.
  Keep the existing replacement notice; no original-summary reader, automatic
  re-anchoring, progress transfer or historical-content restoration.
- `20261105072759_publish_updated_content_versions.sql` adds the edition source
  reference, one-active-draft constraint, guarded ordinary graph saves and
  atomic draft publication. `published_at` protects reading text even after
  Save as Draft. Changes to quick-mode wording or section identity/title/body/
  ordering require a new edition; identical resubmissions, timing maintenance
  and metadata edits remain supported. This is deliberately conservative;
  small wording corrections also create editions. Privileged manual SQL is
  an administrative capability, not a supported alternative editing path.
- The create action explicitly uses the saved copy; unsaved changes in the
  original editor are not copied. New edition sections/artifacts get fresh
  IDs; personal records, audio/timings and embeddings are not cloned. Narration
  and AI indexing follow existing explicit readiness workflows. New-draft
  series controls are disabled; publication inherits the current original's
  position. The active-slot unique index excludes soft-deleted originals,
  retaining their series metadata instead of detaching archives.
- Publication checks both reviewed timestamps and required cover/category/
  quick-mode/readable-section fields under locks. Failed/stale publication
  keeps the original live and draft resumable; repeated creates/publishes are
  idempotent. Child-only graph saves invalidate a held publication review.
  Bulk/direct status publication of an update draft is blocked by a trigger.
- No production mutations, paid resources, provider calls or user data copied.
  Local instance `/tmp/netflux-version-local`, project ID
  `netflux-content-versions`, ports 57621/57622, isolated from every existing
  developer database. Fixtures are synthetic and must be deleted with the
  owned local instance/processes after verification. Never reset another stack.

### Evidence so far

- Local full migration replay/reset passed. Existing continuity + new runtime
  and simultaneous request checks: **18/18 passed**. Includes exact original
  personal/section state comparison, no old audio/embedding/timing copy,
  private drafts, Save/Save-as-Draft guard and downgrade bypass prevention,
  safe metadata/identical graph maintenance, same series slot with archived
  metadata retained, stale/invalid publication recovery, archive immutability,
  role restrictions, repeated editions and concurrent create/publish admission.
- SQL function ACL, admin RPC ACL, new-object access and updated DB-002
  transactional proof passed on the isolated database using the repository SQL
  through `pg`. CLI `db query --db-url` failed to connect locally, although
  `pg` connects and runs the same checks. This is a harness limitation, not a
  passing hosted gate.
- Initial runtime attempt had three JSON-parameter fixture failures: `pg`
  encoded JavaScript arrays as SQL arrays. Explicit JSON serialization corrected
  the harness; original failures retained in session logs.
- Initial focused API/component checks: **19 passed**; additional form review
  invalidation regression and final candidate checks pending.
- Initial full suite: 2,141 passed, 314 skipped, 4 failed. One narration failure
  came from install with lifecycle scripts omitted (ffmpeg missing); installed
  its locked dependency executable and isolated narration tests passed. Three
  parent-#319 unavailable-history tests lacked `useSearchParams` router context;
  added the isolated router mock in this stack; its 9 tests passed. No product
  change to #319. Subsequent full run: 2,143 passed, 314 skipped, 2 reader timeout
  failures under concurrent build/dev/test load. These are unresolved until a
  quiet final run, not converted to verified coverage.
- Lint/ratchets and types passed on the earlier candidate. First build failed
  because the new worktree had no Supabase environment. With the isolated local
  environment, production build, Sharp traces and critical CSS passed. Repeat
  only affected checks after final changes.
- CUA Chrome navigation twice timed out; native address entry did not navigate
  the test-created blank tab. In-app browser fallback works. Initial in-app
  navigation/route waits also timed out during first compilation, then fresh
  state confirmed the real page and successful API responses. One section
  selector did not match; retargeted the visible section title. No writes to
  production or unrelated tabs.
- Actual in-app browser journey created a new draft, rewrote Big Idea and
  section text, saved privately, loaded preservation counts and explicitly
  published it. Returned to admin list showing one published item. At 390px
  the review panel fit without horizontal overflow (viewport and scrollWidth
  both 390). Original-link notice/Notes verification still pending.
- Evidence directory (synthetic content only):
  `/Users/j/.codex/visualizations/2026/10/21/01a15e86-edbe-79c1-8d88-6877902e13bf/content-version-updates`.

### Release hold / exact next steps

Finish the bounded local browser notice/Notes check, final runtime replay,
focused regressions, lint/types/build and quiet full suite; review final diff.
Open a `stacked-pr` PR naming #319 and verify its exact file list. **Do not enable
merge or promote:** disposable hosted §2.2 verification, fresh types/security/
schema comparison and reviewed production dry-run are still required. A paid
hosted project requires a fresh quoted-cost approval; previous projects' cost
approvals do not create another project. Production migration needs explicit
approval for the exact dry-run list. Keep #319's own gate status separate.
Physical devices, Safari, all skipped tests and production behavior remain
outside coverage.

### Final local findings and limits

- In-app browser completed Create → separate draft → rewrite Big Idea/section →
  Save and review → explicit Publish. Admin list showed exactly one active
  published edition. The original reader link displayed the unchanged replacement
  notice and its View original notes link displayed the exact synthetic quotation
  and thought. Screenshot: `content-version-updates/local-original-notes-preserved.png`.
- Initial Notes hydration/search failed because the new worktree lacked the
  restricted snapshot-worker URL and account cursor secret. Provisioned only
  the owned local worker role with a temporary password and local secret; after
  configuration, snapshot creation/collection and filtered Notes reads returned
  201/200, and the original note was visible. No application workaround added.
- Opening the new reader hit a test-fixture image error (`example.invalid` is
  not an allowed image host). Corrected only the synthetic successor's cover to
  a local asset. The next reload was blocked by the in-app browser's
  `ERR_NETWORK_IO_SUSPENDED` error page and URL policy. Do not call that new-reader
  browser check passed; repeat with supported fixtures during hosted proof.
  Attempts to reset/close that blocked in-app tab were also rejected by the
  URL policy; it is an unmarked ephemeral test tab. The Chrome blank test tab
  was closed. Viewport had already been reset before the reader checks.
- Final review caught existing book-identity/ISBN uniqueness preventing a
  same-title/author/ISBN edition draft. The migration permits only linked
  unpublished drafts to share that identity, retaining normal-draft uniqueness
  and rechecking on publication. Runtime fixtures now include a real author,
  ISBN and checklist; they verify fresh artifact IDs/exact original state,
  ordinary duplicates still blocked, and publish conflict rolling retirement
  back. A second-generation archive also preserves the existing series-delete
  FK behavior. No archive-edit exception was added.
- Final targeted database tests: **19 passed**. Function/admin/new-object ACL,
  DB-002, book identity, content invariants and RLS SQL checks all passed locally.
  One local harness refresh raced the owned database reset and saw a missing
  `private` schema; stopped, awaited reset, then reran against the ready database.
  This failed setup attempt is not application evidence.
- Focused API/component/reader regression run: **104 passed**, including private
  save-before-review and invalidating review after newer editing. Quiet full
  application suite: **2,146 passed, 315 skipped** (14 skipped files) at that
  application tree. Final additional SQL/runtime cases were verified separately;
  all skips remain unverified, and hosted CI must establish its own final counts.
- Final production build/Sharp traces/critical CSS passed with the disposable
  environment. Lint/type/capacity checks and clean full migration replay are
  being finalized before PR submission. No provider calls. One agent, no
  delegated work; Codex token/billing usage not available. Repeated local runs
  addressed the recorded setup failures and changed guard/identity cases, not
  a benchmark or repeated sampling to seek favorable timing.
- Supabase quoted **$10/month** for a disposable hosted project in Jseow008,
  with no prorated total. No project created and no approval inferred from
  earlier verification projects. The PR must remain held until §2.2 and exact
  production migration authorization are satisfied.

### Ready for review; release held

The final migration replay from a clean owned local database passed, followed by
**19/19** runtime tests and all seven SQL security/invariant checks listed above.
The replay left **zero auth users and zero edition drafts** after transactional
fixture cleanup. Final changed admin tests: **53/53 passed**; lint/ratchets,
types, production build, Sharp tracing and critical CSS passed. The 2,146-test
quiet full-suite result is reused only for unchanged application paths; the
subsequent admin failure-message branches and added database cases have their
own passing focused checks. Capacity harness passed without skips.

Final schema change also preserves existing normal-draft duplicate book rules;
linked update drafts alone are excluded from active identity/ISBN reservations.
Final required CI executes the version and continuity runtime files explicitly
against its disposable database; default local unit skips do not count for them.
The migration is new and **not applied to production**. No protected merge,
production promotion or production key/configuration changes are authorized by
this implementation request. Keep auto-merge off pending hosted evidence and
reviewed migration approval. #319 remains its explicitly requested parent; its
own required check failure remains separate from this feature's release gate.

Next action after review: obtain the quoted-cost decision for one temporary
Jseow008 hosted project, run §2.2 against this candidate including the supported
cover/new-reader browser check, remove that project, then present the exact
production dry-run list for authorization. No new research or UX scope is needed.

Cleanup completed: stopped only project `netflux-content-versions` with
`--no-backup`; no matching running containers remain. Removed the owned local
fixture credentials, worker password, generated temporary types/configuration
and `.env.local`. No unrelated local stack, user Chrome tab, production account
or paid resource was changed. Sanitized test summaries and zero-fixture proof
remain in the evidence directory. The rejected in-app error-tab close remains
a browser limitation, not a data-cleanup failure (its backing users/data and
server have been removed).

PR opened: https://github.com/Jseow008/ThePlayBook/pull/320, candidate
`6e99a30938717a8b4bc53bdbff5d7a0d99d4acd2`, base
`codex/library-return-selection` (#319), labelled `stacked-pr`. GitHub file list
matches the reviewed 29-file scope. PR scope passed (an earlier cancelled run
was superseded); validate/security are running. Auto-merge is **off**. No timers
or deployment monitoring created. Waiting only for the fresh hosted-project
cost decision before the dependent §2.2 work; exact production migration
approval is a later, separate gate. This post-submission checkpoint is left
uncommitted to avoid an evidence-only CI restart.

### Hosted verification authorized — 5 November 2026

User approved the quoted $10/month and requested hosted proof, the outstanding
new-reader browser check, and deletion afterward. Created only
`netflux-pr320-verification-20261105`, ref `pgshakvnicgnlmssceal`, in Jseow008
(`gpzuqaperuoiqvtgugzb`), ap-south-1. Production ref remains
`xmuqsgfxuaaophxnwure`; they are different. Candidate commit remains
`6e99a30938717a8b4bc53bdbff5d7a0d99d4acd2`. Auto-merge stays off; no production
migration/deployment authorization inferred. Mandatory cleanup: delete this
exact candidate even if a verification stage fails; confirm absence from list.

Hosted progress: pinned candidate replay baseline matched production across all
14 fingerprint categories after setting identical empty read-only search_path
on both connections (the first raw mismatch was schema-qualification formatting
only). Fresh baseline/production types differ only in PostgREST platform version.
Applied exactly the reviewed migration to the candidate; 19/19 hosted runtime
and concurrency tests passed (30s remote test/hook budgets only). Full hosted
reset/replay then matched the pre-reset candidate in all 14 categories, and a
subsequent dry-run was clean. Ten SQL ACL/RLS/invariant checks passed. Generated
new schema matches tracked public types structurally after reviewing the three
pre-existing email-RPC nullable-input overrides already on main; no #320 type
mismatch or type change was made during this verification.

Strict advisor script is **blocked**, not waived: existing public.search_catalog
SECURITY DEFINER execution warnings for anon/authenticated, plus Auth leaked-
password protection. These are also reported on production and not introduced
by this migration. The script's allowlist is empty. Candidate/prod no-policy
INFO findings match (12 intentional private tables); empty candidate has 34
unused-index INFOs vs production 14, consistent with zero usage and the reviewed
new indexes. No unindexed-FK or schema-design performance warning was reported.
Do not claim a fully passed hosted gate or merge. Finish the independently
requested synthetic browser check and cleanup; report this existing-policy
block separately, without changing the checks or security settings.

Setup failures retained: management auth initially received a keychain-encoded
credential (401; decoded the existing CLI credential in memory); Node TLS rejected
the pooler chain until the official Supabase root CA was supplied. No certificate
checks were disabled. The outdated guessed CA download path returned403; resolved
its current /prod/ssl path from Supabase's published dashboard source. No extra
project, production credential reset or application code change resulted.

### Hosted feature proof complete; advisor hold retained

Pinned application commit `6e99a30938717a8b4bc53bdbff5d7a0d99d4acd2`, production
build ID `Hatr8nCUEUzJNE2cmitsM`, ran locally against the disposable hosted project.
This was not a production deployment. The 16 baseline-to-candidate schema
identity changes all match the reviewed migration (version linkage, indexes,
publication/graph guards and RPCs); no unexplained schema change was found.

CUA Chrome completed the real create/save/review/publish journey with synthetic
data and a supported hosted PNG. Published-text Save as Draft was rejected;
creating an updated version produced a separate private draft; review and explicit
publication left exactly one active published edition. Before/after database
comparison proved the original sections, highlights, library and reflection
records unchanged, apart from the planned original retirement timestamps.
The new reader displayed the exact revised Big Idea and multiline section on
desktop and at 390px (scrollWidth=clientWidth=390). The old reader retained its
existing replacement notice, and View original notes showed the exact original
saved quotation and thought. This closes the earlier unsupported-cover and
new-reader verification gap; it does not add an original-summary reader.

The seven smoke scenarios passed: login entry, missing-code auth callback
recovery, Browse, public read, anonymous admin denial, authenticated admin, and
shallow/detailed health (HTTP200/ok, database reachable). Additional API checks
confirmed owner access to the exact original quotation/thought, zero matching
rows for a second synthetic account, and denial of its admin version RPC.
No live/paid AI calls occurred. Auth sessions were synthetic; the user's existing
production login was not changed.

Browser setup failures retained: the first localhost callback attempted HTTPS
and failed with ERR_SSL_PROTOCOL_ERROR; the test ingress's forwarded host was
corrected so the unchanged callback used its configured HTTP fallback origin.
The admin-login gate initially returned404 because the local fixture lacked an
allowed IP; setting only the fixture's ADMIN_ALLOWED_IPS=127.0.0.1 restored it.
No application security checks were bypassed. Local HTTP ingress does not prove
Vercel TLS behavior. Chrome control worked for this run; responsive desktop
Chrome does not establish physical-phone or Safari coverage.

Final GitHub validate, Security Validation and superseding PR scope passed at
the pinned head. CI unit result: **2,149 passed, 316 skipped**. Browser result:
**211 passed, 118 skipped, 1 flaky passed on configured retry** (analytics pageview).
Security SQL runtime checks additionally retain one existing skipped case.
All skips remain outside verified coverage. The separate hosted strict advisor
script still exited1 on the three existing production warnings described above;
GitHub success does not waive that failure. No allowlist or security setting
was changed. PR remains open on #319 with auto-merge off.

Cleanup completed: Supabase CLI deletion of exact ref `pgshakvnicgnlmssceal`
succeeded; a fresh connector project list confirmed it absent while production
`xmuqsgfxuaaophxnwure` remained present. Deletion removes both synthetic users,
their notes/content, uploaded cover and database. Stopped both owned local
servers, removed only the labelled `netflux-pr320-redis` container, and confirmed
no listeners remain on3330/3331/3332. Removed candidate `.env.local`, generated
build, private fixture credentials and the isolated linked CLI directory. No
exact candidate keychain item remained; the global CLI login was untouched.
Reset the Chrome viewport and closed only the two test-created tabs.

Sanitized evidence and screenshots are retained in
`/Users/j/.codex/visualizations/2026/10/21/01a15e86-edbe-79c1-8d88-6877902e13bf/content-version-updates/`,
including `hosted-final-summary.json`, schema/type/SQL proofs, preservation/API
proofs and desktop/390px reader images. No fixture credentials were copied.

**Release hold remains.** Next requires a separate decision on the pre-existing
advisor policy warnings, followed by the reviewed production dry-run and exact
migration authorization. Production migration, merge and deployment have not
occurred. No new research, paid resource or extra UX change is needed to finish
this requested verification. This evidence-only checkpoint remains uncommitted
to avoid restarting unchanged candidate checks.

### Existing advisor investigation — read-only, 5 November 2026

Authorization: investigate the existing warnings and recommend a solution only;
keep #320 held, make no production changes. Re-read Supabase skill, agent/run
rules, current advisor output and official remediation/password-security docs.
Fetched current main `232e104a680207eaa8228a1f408d99a85109f7f4` (#319 is now
merged). The search/auth implementations examined here match main; the only
catalog module difference is #320's new `update_source_id: null` result field.
#320 remains OPEN at `6e99a30938717a8b4bc53bdbff5d7a0d99d4acd2`, old intentional
stack base unchanged, auto-merge off. No branch refresh or implementation done.

**Two search warnings, one intentional public endpoint.** Fresh live metadata
confirms the exact eight-argument `public.search_catalog` RPC is STABLE, SECURITY
DEFINER, owned by postgres (BYPASSRLS), and executable by anon/authenticated plus
service_role; PUBLIC has no execute grant. Search path is fixed to pg_catalog,
public, and browser roles cannot create objects in public. Its index table has
RLS, a deny policy, and no SELECT privileges for browser roles. The function
uses static read-only SQL with explicit returned fields; it references no user
notes/library/reflection/auth tables, filters verified/non-deleted content, and
clamps page size to1..21. Thus these are real privileged-execution warnings, but
not evidence of a private-data disclosure. Existing contract tests explicitly
permit this exact public function; the advisor allowlist is independently empty.

Read-only role probes used the ordinary query `risk`, a5s statement timeout, and
transactions rolled back afterward. Both anon and authenticated produced21
results, with zero results outside the active verified catalog. No record text,
personal identifiers, hashes/passwords, new accounts or writes were needed.
These database-role probes do not prove every query safe or replace browser
account testing. Current owner privileges remain broad even though the present
function body is narrow. The database function does not itself cap query length;
the160-character application normalization can currently be bypassed by calling
the public Supabase RPC directly. This establishes an additional exposed input
surface, not observed denial of service or exploitation.

All discovered product call sites are server routes/components using
`lib/server/catalog-search.ts`; that module is already `server-only` and uses
the cookie-free anon client. Browser results come from the application route.
Revoking anon now would therefore break public search. Merely switching to
SECURITY INVOKER would fail on its private index; granting browsers the index
instead would expand access and is not recommended.

**Recommended separate security change:** keep the same search function,
private index, published-only output, ranking, pagination and account-bound Notes
search. Change only this server-only catalog module to use the existing server
service credential for the fixed RPC, then revoke EXECUTE from PUBLIC, anon and
authenticated while retaining service_role and an explicit signed service-role
guard. Update the exact catalog ACL/static/runtime expectations rather than
weakening the general checks. This removes direct privileged browser execution
and leaves public search available through Netflux. It is optional hardening of
an intentional design, not a claim that the existing function leaked notes.
A precisely scoped, reviewed advisor exception is technically supported by
Supabase for intentional functions, but is not the recommended first option
because all current product callers are already on the server. No exception
was added or approved in this investigation.

Deployment order matters: first deploy the compatible server caller while the
existing live function already permits service_role. Only after confirming that
caller is live should the separately approved ACL/guard migration restrict the
RPC. Reversing the order would break the old application's anon call. Keep the
server credential out of browser code; expose only this fixed read operation.
Follow the normal independent-PR and database release gates; no migration SQL,
app change, deployment, or rollout authorization is supplied by this report.

**Leaked-password warning is an actual disabled control.** Read-only management
configuration reports password_hibp_enabled=false; email and Google providers
are enabled, signup is open. Organization Jseow008 is already Pro, with both
auth.leaked_password_protection and auth.password_hibp entitlements available.
No upgrade/additional recurring plan purchase is required. Public UI uses Google
and email OTP, but `/api/admin-login` uses signInWithPassword and email-provider
password APIs remain enabled. The warning cannot be dismissed because the main
UI is passwordless. No actual password was inspected or tested for compromise.

Recommend enabling only leaked-password protection after approval, with a
synthetic known-compromised signup/password-change rejection and strong-password
acceptance check, plus existing admin sign-in and Google/OTP regression checks
appropriate to the changed setting. Do not disable the email provider (it also
serves OTP), force resets, rotate secrets, revoke sessions or change current
user passwords. Supabase documents existing-password sign-in behavior separately
from new-password checks; do not claim enabling this retroactively cleans all
accounts. The observed6-character minimum is a separate password-policy choice;
do not silently bundle a length/complexity or reauthentication change into this
warning's remedy.

Local read-only verification: catalog search contract, catalog module and
security gate tests **16/16 passed**, no skips. No database-mutating runtime
tests ran against production. The twelve private RLS/no-policy findings remain
INFO and intentionally deny browser access; no policies should be added just to
clear them. Preserve prior skipped tests and physical-device limitations.

Acceptance for the proposed security work: anonymous/signed-in application
search retains exact results, snippets and pagination; direct anon/authenticated
RPC and index access fail; server RPC retains published-only output and cannot
retrieve another account's Notes. Check drafts, retired content and malicious or
oversized inputs with synthetic local/approved disposable data. Confirm no
service secret in browser artifacts, rerun affected ACL/contract/runtime checks
and strict advisors after the actual approved rollout. For password protection,
verify the flag and behavior rather than relying only on advisor freshness.
Reuse unrelated #320 feature evidence; refresh its candidate onto secured main
and rerun affected integration/gates before its separate exact migration decision.

Official references:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Structured audit: task evidence `content-version-updates/advisor-investigation.json`
and `advisor-settings-summary.json`. Only safe selected settings/entitlements
were saved; management token stayed in process memory. No paid resource, account,
provider call or browser session was created. No production setting, grant,
schema, data, migration, app code, allowlist or PR merge state changed. One agent;
Codex billing/token usage unavailable. Release remains held. Exact next action:
owner reviews this separate two-part security proposal; implement only on a new
approved request. Existing implementation evidence/checkpoint remains local and
uncommitted; no evidence-only CI restart.

### Security dependency released; #320 still held

The subsequent explicitly approved security work is complete in merged #321,
production commit `ddbecb9b4dbd9dae0821d46e2968e982bb841073`, READY deployment
`dpl_AW6Z4uoFL3aE4C3DvceEYXnyM1hq` on www.netflux.blog. Deployed the compatible
server caller first, then applied only the approved
`20261105094614_restrict_catalog_search_to_server.sql`. Public search/pagination,
direct anon/auth denial, isolated-account access and strict production advisors
passed. Leaked-password protection is enabled and behavior-verified. Temporary
hosted project and all three production synthetic users were cleaned. #322 was
consolidated into #321 and closed; no second security PR remains to release.

Full checkpoint and retained failures/limitations:
`/Users/j/.codex/workspaces/netflux-catalog-search-security/docs/CONTENT_CONTINUITY.md`,
Production security release complete section. Final security candidate differed
from hosted-tested application/SQL only in CI fixture wiring and release records.
Final CI2,140 unit passes/308 skips;211 browser passes/118 skips and1 retry success.
No gates weakened, no paid AI calls or real user note/content edits.

#320 remains OPEN at `6e99a30938717a8b4bc53bdbff5d7a0d99d4acd2`, auto-merge off,
feature migration NOT applied. The owner approved only the named security
migration; that approval does not extend to #320 SQL. Advisor block is cleared;
next step for this feature is refresh onto secured main, resolve any integration
conflicts and run affected/final required checks before its separate production
dry-run and exact migration decision. Do not deploy the old anon catalog caller
now that direct RPC access is restricted. No action on #320 was taken during the
bounded security release beyond retaining this hold/checkpoint.

### Refresh onto secured main — 5 November 2026

Owner requested refresh of #320 onto secured main, required checks, an unmerged
hold, and the exact production migration list before any apply. Rebased only the
feature commit from former #319 parent onto main
`ddbecb9b4dbd9dae0821d46e2968e982bb841073`. Source merged automatically; only
checkpoint appendices conflicted, resolved by retaining secured-main records and
all existing #320 hosted/investigation evidence. No feature or security behavior
change intended. The preserved pre-refresh report is also in task artifacts.

Migration remains byte-for-byte unchanged, SHA-256
`4b61acedd09836010e5f35c212e4d91ac924a1215ddd6b12ce3c9072438f4730`.
Keep the server-only service caller, signed-role catalog guard, restrictive ACL
checks and all three CI credential-export paths. Reuse the unchanged migration's
19-case hosted and browser evidence; rerun affected local contracts/types and
required CI/security against the full integrated schema. No new paid project,
account, production data change, merge or migration is authorized by this refresh.
Auto-merge stays off. Exact production dry-run will be shown for separate approval.

Refresh preflight:81 focused admin/version/form/history/catalog/security tests
passed, plus typecheck and full lint/ratchets. Byte comparison confirms all
feature migration/admin UI/API/types and version-runtime files match the
previously hosted-tested implementation exactly. Secured main's CI service-key
exports, server-only caller, signed-role guard and restrictive ACL checks remain
intact; this PR adds only the nullable result field to that caller and its19-case
version/continuity runtime command to the security workflow. Parent-history
fixture integration merged without a product-code conflict.

Production read-only CLI used an isolated workdir without relinking the repo.
`db push --linked --include-all --dry-run` lists exactly:
`20261105072759_publish_updated_content_versions.sql`. Include-all is necessary
because this unchanged file predates the already-applied security migration;
it is not permission to apply other files. Migration list confirms that one
pending version and the applied secured-main history. No schema/data/Auth
settings were changed, no paid project/account/model call was created. Fresh
required CI/security must still pass on the refreshed head; no auto-merge or
production application authorization is inferred from the refresh request.

### Refreshed integration evidence — candidate ae42a7e2

Candidate `ae42a7e2ce9adb2d27139831102998924af8913a` targets secured main
`ddbecb9b4dbd9dae0821d46e2968e982bb841073`; PR #320 is open and auto-merge is
off. Fresh Security Gates run `42019274962` passed Security Validation and
Catalog Search Evidence. The integrated database ran all 19 preservation cases:
10 continuity, 8 content-version and 1 concurrent publication case, zero skips.
Security route/static checks passed 199 cases. Catalog runtime passed 5 with
1 performance case skipped there and exercised independently by the successful
dedicated evidence job.

CI began just before retargeting the PR to main. Its checked-out synthetic merge
`f82162cb4a20b8f37561842352c3ce4807f52b87` has tree
`66c36cfdcd01a1d39ac447874158225679ddc910`, exactly matching the refreshed
candidate tree. Base main is already an ancestor of the candidate; this evidence
validates the complete final source tree, not a stale stacked implementation.
The required CI `validate` run `42019274957` has passed unit tests and build and
is still running browser tests at this checkpoint. PR scope passed.

A repeated production read-only dry-run still lists only
`20261105072759_publish_updated_content_versions.sql`. No SQL was applied.
The isolated linked production workdir and in-memory credential helper have been
removed; sanitized inventory/dry-run evidence is retained in the task artifacts.
No new paid project, synthetic account, model call or production-data mutation
was needed for this refresh. Historical hosted/browser evidence remains bounded
to unchanged code; phones, Safari, skipped cases and earlier failed attempts
remain outside verified coverage. Final CI results are still required; no merge,
promotion or production apply is authorized by this refresh.

### Final refreshed gates and production hold

All required gates passed on `ae42a7e2ce9adb2d27139831102998924af8913a`:
PR scope, CI validate (`42019274957`) and Security Validation
(`42019274962`). Catalog Search Evidence and Vercel preview also passed.
CI: 2,152 unit tests passed / 317 skipped; browser: 211 passed directly,
1 passed on its configured retry / 118 skipped. The retry was the existing
PostHog first-pageview/client-navigation proxy case at analytics.spec.ts:149:
its initial capture count was 0 when >0 was expected. Retain that failed first
attempt; no check was weakened or entire workflow retried for this refresh.
The 19 continuity/version/concurrency cases skipped by ordinary unit mode were
all explicitly executed and passed, with zero skips, in Security Validation.
Other skipped tests, physical phones and Safari remain outside verified coverage.

Final read-only production dry-run lists exactly one pending migration:

- `20261105072759_publish_updated_content_versions.sql`

SHA-256: `4b61acedd09836010e5f35c212e4d91ac924a1215ddd6b12ce3c9072438f4730`.
The secured-main migration is already applied. No feature SQL has been applied.
PR #320 remains OPEN against main, CLEAN, auto-merge OFF, with no merge or
production promotion. The exact list is presented to the owner; explicit
authorization for this file is the next production decision. Refresh approval
is not treated as production migration approval.

Sanitized final results and dry-run inventory are retained in the task artifacts.
The isolated production link and credential helper were removed; the repository
was not relinked. No paid resource, account, model call, or production application
data/Auth setting change was created by the refresh. Final report edits remain
uncommitted so that evidence-only changes do not replace the tested PR head.

### Authorized production release #320 — 5 November 2026

Owner explicitly approved `20261105072759_publish_updated_content_versions.sql`,
releasing #320, and verifying original highlight/note preservation. Rechecked
required PR scope, validate and Security Validation gates at `ae42a7e2`; all
passed. Exact production dry-run and migration inventory still listed only the
approved file, with unchanged SHA-256
`4b61acedd09836010e5f35c212e4d91ac924a1215ddd6b12ce3c9072438f4730`.

Production `xmuqsgfxuaaophxnwure`: verified completed daily physical backup
`2168165671` from 2026-11-04 23:49:55 UTC and captured fresh affected-function
definitions before mutation. Applied only the approved SQL through an isolated
CLI workdir. Follow-up dry-run is clean and all local/remote migration versions
match. Before/after server-side fingerprints for content, sections, highlights
(including note_body), library and reflections are identical, excluding only
the added nullable update_source_id field. No existing editorial/user row was
rewritten by the migration. This is not a backup restoration test.

Post-apply checks: five production-safe function/admin/analytics/embedding/Storage
ACL/RLS checks passed; full read-only object-access inventory passed; all five
reviewed new/replaced function bodies match the SQL; the existing graph body
was moved intact. Strict security advisors passed with the existing 12 INFOs.
Performance returned INFO only (15 unused indexes, including new unexercised
version indexes, and one Auth connection-sizing notice); no policy, grant or
configuration was changed to hide findings. The guarded publication function
and version column were confirmed.

Protected squash merge: `14e84be19866f18ccd331af60c17a17c7ecd4583` at
2026-11-05 11:55:48 UTC. Production build
`dpl_B27zQSmRAZ3KM7tbr2X2Lh9TR9mG` /
`netflux-x15j095i9-jseow008s-projects.vercel.app` reached READY. The public alias
initially still resolved to #321. Promoted this exact READY production build,
without rebuilding a preview or changing project/domain configuration; a fresh
www.netflux.blog lookup resolved to the merge commit and same deployment before
testing. Public health returned HTTP200/ok. The deployment-specific 15-minute
error-level runtime-log scan returned no records; this is bounded observability,
not proof that every request is error-free.

Production CUA verification used one temporary synthetic admin/owner in an
isolated IAB Chromium session. Existing Chrome login was untouched. Created
synthetic original content, a section, a highlight with a multiline thought,
library progress and a reflection, plus an owned PNG. Postponed only that
account's personal-index jobs within fixture setup; attempts remained0. Used
the real admin controls to Create updated version, rewrite its Big Idea and
section, Save and review updated version, then Publish updated version. Review
reported preserving1 library record,1 highlight and1 reflection. Immediately
after publication, deep before/after comparison proved the original section,
complete highlight/note row, library and reflection unchanged. The successor
was verified with a new section ID and zero copied personal records.

Browser outcomes: original /read showed the existing replacement notice; View
original notes reached the owner-filtered Notes page. DOM comparison confirmed
the exact saved quotation and exact thought including its newline, with the
original reflection visible. Updated /read displayed the exact revised Big Idea
and expanded section, with no inherited highlights. Signed out via the UI and
confirmed the original Notes destination required login. No original-summary
reader, historical restoration or other UI scope was added. Screenshots are in
the production-release artifacts; the Notes viewport image shows the reflection
while the lower quotation/thought were verified by DOM comparison.

Cleanup confirmed zero owned Auth users/sessions/profiles, original/replacement
content and sections, highlights, library/reflections, personal-index jobs and
Storage cover objects. UI sign-out left0 sessions before deleting the synthetic
account. Both test-created tabs were closed, no viewport override was used, and
only the private release helper/workdir/fixture credentials were removed. No
paid project or live AI/narration action was used; no test embedding processing
attempt occurred. The global CLI login and unrelated processes/tabs were left
alone.

Retained harness/setup attempts: the read-only wrapper stopped DB-107's negative
fixture CREATE, so no DDL occurred; only its non-mutating access inventory was
run in production (full negative proof passed in CI). The local function-body
parser first assumed a trailing semicolon in pg_get_functiondef; corrected and
reran the affected schema proof. Fixture transaction initially named nonexistent
profiles.full_name and rolled back; reused the same single Auth user/owned cover
with role-only setup. An initial wait for review before saving timed out because
the draft correctly requires Save and review first. A read-only log query used
a string level where the connector required an array; corrected once. None was
a product regression, an extra paid rehearsal, or a weakened check.

Coverage remains bounded: final pre-merge CI2,152 unit passes/317 skips; browser
211 direct passes+1 configured analytics retry success/118 skips. All19 feature
database cases passed separately with zero skips. Physical phones and Safari
remain unverified; prior hosted390px proof is reused only for unchanged code.
All skipped cases and earlier failed attempts remain outside verified coverage.
Release and preservation verification are complete within this scope. Final
evidence-only checkpoint edits are local/uncommitted to avoid an unrelated new
deployment; sanitized proofs live under content-version-updates/production-release.

### Reopened Notes → reader verification — 5 November 2026

Owner supplied How Minds Change / Street Epistemology screenshots and asked for
actual production verification rather than assumptions. No product implementation
change was authorized or made. Worktree/branch remain
`netflux-publish-updated-version` / `codex/publish-updated-version`, local tested
head ae42a7e2; production is READY at merge14e84be1, deployment
dpl_B27zQSmRAZ3KM7tbr2X2Lh9TR9mG, freshly resolved from www.netflux.blog.

Correction to prior broad explanations: #320's notice is for an explicitly
published replacement relationship. A later updated_at timestamp alone neither
establishes a substantive rewrite nor creates such a relationship. The actual
notice copy is “This summary has been replaced”, not the paraphrase “An updated
summary is available”. Zero replacement rows did not establish zero historical
in-place edits. The earlier release verified original URL → notice → original
Notes and preservation, not the full fresh Notes card → notice return journey.
The end-to-end release claim is qualified by the confirmed defect below.

**Real user case PASS within current design:** used the existing authenticated
Chrome account named by the owner, opened /notes?q=test, and clicked the actual
How Minds Change Open passage link. It reached the original stored highlight ID
and marked exactly “challe” once in Street Epistemology. No missing-passage or
replacement warning appeared. Production data confirms this exact highlighted
text remains in the current section, source available/verified, update_source_id
null, and no replacement relationship. The last content timestamp is 30 October;
that is not evidence of a version publication. The screenshot does not show a
failed replacement notification. Saved highlight timestamp, quotation, thought
and content timestamp were compared again after verification and are unchanged.
No private thought text was persisted in evidence.

**Synthetic replaced-note journey FAIL:** one disposable Auth/admin owner, one
synthetic content item/section/highlight/multiline thought and one owned PNG were
created in the existing production project. No paid project or new configuration
was needed. Own personal-index work was postponed in fixture setup and remained
at0 processing attempts. Before publication, the actual Notes card and footer
linked to the exact original highlight; clicking marked its exact quotation once.
Published a separate saved rewrite through the existing production version RPCs
(the admin create/save/review/publish UI was already verified in the release).
Deep comparison proved the original section and entire highlight/thought row
unchanged after publication.

On Back to Notes, old cached metadata briefly retained the source title and
Open passage link. Before the attempted click, the fresh response removed both;
the click failed with no matching link. AX diff confirmed removal, so this is
not attributed to browser-control failure. Reload reproduced the stable state:
one retained note/quotation/exact multiline thought, generic Saved passage
heading, zero Open passage links. A read-only authenticated-owner SQL probe
against the deployed search_user_highlights returned the retained original
content_item_id but null content_title and segment_title, with both quote and
thought exact.

**Saved URL and successor PASS:** opened the exact original highlight URL copied
from the card before publication, including highlightId. It displayed the actual
replacement notice. Clicking its Open updated summary link reached the correct
successor and revised Big Idea, with no stale highlightId forwarded. Signed out
through the UI and verified Notes requires login. The notice and destination work;
fresh Notes currently fails to provide the route to them.

Root cause: caller-scoped search correctly hides retired source/segment metadata
through RLS while retaining the owner's note. API
app/api/library/highlights/route.ts:408 maps missing content_title to
content_item:null. Notes client-page.tsx:183 then returns no href without the
joined content_item.id, despite the retained content_item_id and available public
replacement relationship. This is a confirmed navigation/source-identification
defect, not loss of the saved thought or a reason to weaken RLS.

Recommendation for a separate narrow correction: retain routing to the original
/read for owned saved notes whose original has a recorded, accessible published
replacement; let the existing notice offer the updated summary. Recover only
appropriate public source-identification metadata. Distinguish truly deleted,
withdrawn or inaccessible targets. Do not automatically relocate highlights,
restore historical content, or infer an update from general timestamps. Test
card/footer and refresh/reload after publication, exact saved data preservation,
updated-target availability and account denial before any new release claim.
No fix has been implemented by this audit.

Existing BrainClientPage + ContentReplacementNotice tests:22 passed in2 files.
They do not cover the full publication → fresh Notes → notice journey, so they
do not negate the reproduced failure. Retained harness attempt: first read-only
owner SQL probe omitted required RPC arguments; corrected once using the actual
eight-argument signature. No product change or data mutation resulted.

Cleanup: UI sign-out revoked the disposable session before Auth deletion;
confirmed0 owned users/sessions/profiles/content/sections/highlights/library/
reflections/index jobs/replacements/Storage cover objects. Only the two created
verification tabs were closed. Existing Chrome login and user notes/content were
not edited; ordinary navigation can update last-read/reading-position telemetry.
No viewport override, live AI action, narration generation, paid resource or
production policy/configuration change was used. Private helper/fixture password
files were removed after sanitized results were retained.

Evidence: content-version-updates/notes-link-audit contains audit-results.json,
production RPC/preservation/cleanup proofs,22-test summary and synthetic-only
missing-link/working-notice screenshots. Desktop Chrome/IAB Chromium only;
phones, Safari, CI skips and untested journeys remain outside coverage. Feature
#320 remains live; its data-preservation/publication proof stands, while the
Notes → replacement return path is explicitly open pending an approved fix.

### Source-link proposal visual — 5 November 2026

Owner requested findings plus a current/proposed visual only; no implementation.
The standalone netflux-replaced-note-source.html comparison recreates the verified
replaced-note fallback with synthetic text, then proposes preserving the original
public source title and a View source action. Card and footer route to the same
existing replacement notice. View source is proposed for replaced sources because
Open passage would imply an original reader that has not been implemented.
Available normal notes keep their existing Open passage behavior. Recover only
source metadata appropriate to a recorded, accessible published replacement.

The comparison includes the existing notice and an illustrative successor so the
route can be explored, with a narrow-screen setting. Proposal is not the state
of How Minds Change, which has no recorded replacement. Historical-edit alerts,
original-body restoration, new badges and account/access changes are outside it.

Local preview inspected at desktop,390px and320px; original-note return and
source → notice interaction worked,320px had no horizontal overflow and the
footer wrapped. Script syntax/fragment contract checked; no product tests/CI or
production resources were used. An initial preview invocation supplied both a
destination and --serve, which the helper rejected; corrected to --serve only.
Preview viewport was reset, tab closed and only the owned server stopped. The
last small visual-only edit added a return-to-example control on the illustrative
reader and corrected its font fallback; it received syntax validation and reuses
the already checked local routing handler. Product code remains unchanged.

### Retained Notes source implementation — 5 November 2026

Owner approved implementing the reviewed current/proposed visual. Independent
branch codex/notes-replacement-source, worktree netflux-notes-replacement-source,
starts from refreshed origin/main14e84be1 (#320 is already merged/live). The app
worktree helper rejected its argument shape; an isolated Git worktree was used.
The original worktree and its uncommitted verification records were preserved;
this report carries those release/audit records forward.

Scope: enrich only owned, returned highlight rows with missing source metadata,
using one batched caller-scoped read of existing public replacement notices.
Their RLS policy requires an accessible published successor. Retain only the
original source ID/title, no retired text/author/cover or new permissions. Notes
uses View source for these rows, the existing card/footer routes remain on the
original read destination with highlightId, and the existing notice offers the
successor. Available sources keep Open passage; missing/withdrawn/inaccessible
replacements keep the unavailable fallback. Lookup errors must fail explicitly,
not silently hide links. No migration, original-reader restoration, historical
edit notification, note mutation, search/filter or draft change is planned.

Regression verification will cover fresh server data/remount, original IDs,
normal/unavailable states, failed lookup, pagination, real publication → fresh
Notes/reload → notice → successor in the browser, and owner/account isolation.
Implementation and verification are in progress; no new release claim yet.

Implementation preflight:36 focused tests in4 files passed, plus typecheck,
full lint/ratchets and production build/Sharp/CSS checks. The existing continuity
browser regression now exercises fresh Notes, reload, View source → notice →
successor and an unchanged original note. Local disposable Supabase uses only
owned583xx ports/containers; a real Redis/Lua REST adapter passed admission and
denial preflight for production-build checks. No production environment or keys
were reused. Owner explicitly approved the quoted10 USD/month for one temporary
hosted project in Jseow008; it will be removed after candidate verification.
No additional cost or migration authorization is inferred.

### #323 hosted candidate verification and hold — 5 November 2026

Implementation candidate337b57b516e68b1fbc5344ce102987c3cbf960d7, PR323,
branch codex/notes-replacement-source, same isolated worktree. No application
changes after candidate testing. A documentation-only follow-up carries results.

Temporary hosted candidate zityiokdzftzwajjjnfz (Jseow008), distinct from
production xmuqsgfxuaaophxnwure. Owner approved quoted10USD/month without a
prorated quote. One project created. Initial CLI login failed before schema
application; aligned only the disposable database password through the documented
Management API. Full push, candidate-only reset/replay, clean final dry-run
passed.14schema fingerprint categories match production; fresh generated types
match after normalizing only PostgREST platform-version metadata. Five security
checks and disposable-only DB002 passed. Strict security advisor:12INFO,
zeroWARN/ERROR. Performance:35unused-indexINFO on an empty candidate and one
absolute-auth-connectionsINFO; no schema/index-policy changes or WARN/ERROR.
No production migration, configuration, saved data or credentials were changed.

Built exact candidate with hosted public/service credentials, isolated production
Next server3337 behind localhost3338 HTTP ingress, real owned Redis58379 with
REST58380. No AI/provider/monitoring keys, production data or production secrets
copied. Supabase skill and full-story verification guidance applied; final React
review found no added client request/effect or layout/accessibility change.

CUA browser proof (in-app Chromium desktop1280 and390x844):
- Synthetic owner: normal Notes baseline → Create updated version → changed
  title/Big Idea → Save and review → Publish updated version. Existing review
  explicitly counted2highlights retained. Publication completed normally.
- Fresh Notes and genuine reload retained original public title, quotation,
  exact thought textContent (including newline), original sourceID/highlightID.
  Desktop footer and narrow card both opened existing replacement notice;
  Open updated summary reached changed new edition without old highlightID or
  reassigned marks. View original notes kept original item filter. No overflow.
- Normal Open passage/control card reached one exact saved quotation mark in
  original section. Withdrawn synthetic successor caused fresh Notes to hide
  View source and show unavailable fallback, preserving exact thought. Restoring
  only that fixture restored the source link after reload.
- Built HTTP API with two real synthetic sessions: each owner saw only own rows;
  direct caller-RLS reads denied other owner's note and original retired body;
  unauthenticated endpoint401. Exact saved fields/anchors/IDs unchanged; dates
  compared at client millisecond precision, not claimed byte-identical strings.
- UI sign-out cleared personal Notes. Working tab closed; responsive override
  reset. Failed setup tab could not be rebound/closed because browser URL policy
  rejects its error-page data URL; left to automatic ephemeral-tab cleanup.

Smoke coverage is6of7 outcomes using CUA/API equivalents, not a claim that
production-smoke.spec.ts ran: login, missing-code callback recovery, browse,
public reader, anonymous-admin denial and synthetic-admin entry passed.
Shallow health200; detailed health503/degraded. Database, Supabase configuration,
site URLs and real Redis rate limiting ready. Only missing components were AI
creation/retrieval keys and Sentry monitoring, deliberately omitted to avoid
live external processing. Do not substitute dummy keys or call this healthy.
OPS§2.2 requires all seven smoke checks and an explicit exception before promotion
if any cannot pass. This source-link change does not modify those services;
recommend a narrow exception for their absent test credentials, pending owner
acceptance. Keep auto-merge OFF and release HELD until that decision and required
CI/security. No production release claim.

Retained failed attempts/limits:
- First callback followed forwarded-host HTTPS on HTTP localhost. Added isolated
  ingress with explicit headers; fresh test tab then recovered correctly.
  Error-tab URL policy blocked further actions; no security warning bypassed.
- Initial admin wait used Content Dashboard; actual heading Admin Dashboard.
  Premature Publish wait preceded required Save and review; completed through
  real UI after reading state. Source fixture initially used missing /icon.png;
  corrected to owned Storage PNG before publication. Normal control retained
  an image fallback visible in evidence; not a product-image regression claim.
- Management-query timestamps include microseconds while pg fixtures serialize
  milliseconds. Initial whole-row string comparison failed; exact saved fields
  verified separately and dates normalized only to client precision.
- innerText collapses existing paragraph whitespace; exact multiline textContent
  and API/storage were retained. No multiline presentation change claimed.
- Auxiliary API global sign-out invalidated disposable owner's browser session;
  restored the synthetic login before narrow checks. No production login touched.
- Shared synthetic IP and accumulated library sync requests produced sync/rate
  warnings. One normal footer click was covered by the toast and did not navigate;
  dismissed it and visible card opened exact mark. No new activation fix inferred.
-36focused tests rerun and passed after final code/mock adjustment. Types, full
  lint/ratchets, build, Sharp and criticalCSS passed. Explicit-local continuity
  E2E remains outside hosted CUA proof; current CI skipped tests, phones, Safari,
  real AI/monitoring readiness remain outside coverage. No new paid AI calls.

Cleanup completed: hosted project deleted and absent from project list,
including its synthetic users/content/highlights/Storage. Only owned isolated
Next/ingress/Redis processes stopped; local Supabase stopped with no-backup and
owned Redis removed. Private credentials/generated types/fixtures/workdirs and
candidate .env.local/build removed after sanitized evidence capture. Unrelated
services and existing authenticated Chrome session untouched.

Evidence: content-version-updates/notes-source-fix contains verification-summary,
API/preservation results, schema fingerprints, advisor/security/DB002 proofs,
health503 explanation, project-deletion/absence proof and synthetic screenshots.
At cleanup CI42051778856 validate still running E2E; Security42051778789 passed.
No unchanged retry, gate waiver or auto-merge enabled. Next action: resolve only
that narrowly described health exception, then inspect final required checks and
normal protected release. Never recreate a paid project without approval.
