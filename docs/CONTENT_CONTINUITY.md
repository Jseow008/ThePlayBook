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

The owner confirmed three gaps at `8fb698ac`; all three are corrected on the existing PR branch:

- Series deletion may perform only the foreign key's detach of an archived edition. The trigger verifies the former parent is gone and all non-series/non-timestamp fields are unchanged, clears the paired ordinal, and continues to reject manual detachment, reassignment and content edits. The unreleased migration was corrected in place; no production migration was applied.
- Original-summary Notes links now use the existing per-content reflection endpoint. Reflections remain visible under the summary filter and the Reflections tab, even when the catalog join is null for an archived source. Broader reflection text/color/sort search remains outside this change.
- Unavailable entries expose Remove from Saved or Hide from Continue Reading/Completed through the existing mutation/archive hooks, with Undo. These explicit actions preserve progress, notes and audio positions; catalog reads remain non-destructive.

Fresh evidence: 44 focused component/API tests plus all 10 full-schema disposable database runtime tests passed. The complete 114-migration local replay, three SQL permission audits, lint, types, production build/Sharp/CSS checks, migration uniqueness and whitespace checks passed. The extended actual-production-app journey passed on desktop and mobile in 17.4 seconds: it checks the scoped reflection API response and both reflection views, all three list actions, archive Undo, and retained reading/audio state. The first browser run found an ambiguous test selector shared by available and unavailable cards; scoping it to the unavailable section corrected the test without changing product behavior. No production data changed. This is local verification, not the required disposable hosted gate.

The earlier 1,816-test run belongs to the initial candidate; the correction evidence above is the current affected-check evidence. Single agent; no provider calls or token-usage measurement. Hosted organization choice and the original affected IDs/backup remain pending.
