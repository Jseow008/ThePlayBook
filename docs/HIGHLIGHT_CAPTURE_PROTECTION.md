# Highlight links and unfinished notes

## Scope and acceptance

Implement the agreed defects only: owned links beyond the first 50, durable destinations across reload without repeated scrolling, explicit request-failure versus unavailable states, and unfinished draft protection. Drafts must remain account/target scoped, must not overwrite newer saved notes, and must never become saved notes without explicit Save. Automatic note opening, save-toast navigation, and broader retrieval changes are excluded.

## Implementation

- Branch `codex/highlight-links-draft-protection`, based on freshly fetched `origin/main` at `6ad8de50`; isolated Git worktree `/tmp/netflux-highlight-links-draft-protection`. Managed worktree creation was unavailable from the project-mirror chat.
- Authenticated point lookup checks caller ownership and content access. The reader merges the destination into its first page, keeps `highlightId`, and handles each account/content/target once. Async navigation guards prevent stale lookups from scrolling a different destination.
- Tab-local unfinished drafts are keyed by account and highlight (or exact new selection). Existing-note reopen checks the current saved baseline. If changed, show the newer saved note and require an explicit recovery/discard choice for the retained draft. Sign-out clears drafts. Other closes preserve; native unload confirmation supplements recovery.
- Existing-note Save uses atomic compare-and-set predicates for text, color, and update timestamp, plus the expected account. Rejected saves retain drafts. Overlap-note replacement reads the current baseline and asks before replacing saved text. No server autosave or migration.
- Shared behavior covers Notes-page editors, mobile composer, selection-note tools, and desktop floating editor. Existing layout and typography are preserved.

## Bounded behavior evidence

Verification used a locally served production build, two disposable ordinary accounts, and 52 synthetic personal highlights. Only synthetic personal records were changed; existing public content was read. The last safety changes (selection identity, overlap-note comparison, destination-status scoping) have focused regressions and a final build; browser evidence predates those changes.

| Check and reproduction | Expected | Observed | Impact / confidence |
| --- | --- | --- | --- |
| Open rank-52 highlight, outside first 50; reload same URL | Correct section/passage revealed, URL retained | Correct mark near top, section expanded; retained URL worked after reload | Restores older-link access; high for tested built path |
| Owner GET; other account GET; guest GET | Owner resolves; others cannot read | HTTP 200 / 404 / 401 | Ownership retained; high, real API |
| Failed GET versus unavailable target | Retryable failure differs from deleted/inaccessible | Distinct regression assertions pass | Avoids silent failure; high, automated |
| Refetch/rerender after reveal | No repeated automatic scroll | Regression confirms one jump; reload is a fresh visit | Protects reading position; high, automated |
| Desktop Notes: edit, Escape, reopen; mobile: edit, outside tap, reopen | Retain unfinished edits without saving | Both recovered exact marker text | Prevents accidental loss; high for tested browser paths |
| Keep draft, change saved note in second session, navigate back and reopen | Show newer saved text; older draft requires explicit choice | Newer text shown, older edits retained separately, Save disabled pending choice | Prevents silent overwrite; high, browser and hook tests |
| Reject note over 4,000 characters | Retain draft; saved note unchanged | Draft remained open, saved text unchanged. Validation message subsequently clarified and unit tested | Prevents failed-save loss; high |
| Explicit Cancel then reopen | Discard unfinished edits | Saved baseline returned; draft removed | Honors discard; high. A transient toast intercepted pointer clicks; keyboard activation verified Cancel |
| Switch account/highlight; unmount/navigation; rejected recheck | Correct scope, retained draft, no autosave | Hook regressions pass | Prevents misplaced drafts; high, automated |
| Desktop floating reader editor | Shared behavior must regress safely | Original component cases plus recovery, failed-save and Cancel regressions pass. Browser control did not remain open reliably | **Browser behavior remains unverified** |

Mobile evidence uses a 390×844 viewport; physical touch devices and software-keyboard positioning were not tested. Synthetic accounts/highlights were deleted, sessions revoked, private credential files removed, and isolated preview/bootstrap servers stopped. Implementation cleanup: 2 accounts and 52 highlights removed at `2026-10-22T12:52:42.594Z`.

Sanitized real API evidence: owner lookup 200; other account 404; guest 401; explicit save 200; stale save 409; newer saved note preserved. These actual queries against the existing hosted schema **do not replace the separate disposable hosted database gate required by OPS §2.2**.

## Initial implementation checkpoint (follow-up below is authoritative)

- Focused final regressions: 69 passed. Lint (including policy checks) and typecheck passed. Final default production build, Sharp traces (5 routes), and critical CSS passed.
- Final full suite: **1,838 passed, 287 skipped** (244 files passed, 10 skipped); capacity harness: **34 passed**. Earlier fresh-dependency run had one missing local ffmpeg executable; restoring the existing dependency binary resolved the narration tests. Another run overlapped the build and encountered timing failures; it was stopped, then the final two-worker run passed after the build. No assertions or timeouts weakened.
- Environment retries: dependencies symlinked outside the worktree were rejected by Turbopack; isolated locked dependencies fixed that. A stale artifact briefly lacked an import already fixed in source; clean rebuild and browser retest replaced it. Initial API-test mock sequencing and stricter ref lint were corrected.
- One agent; no application-model/provider calls. Exact elapsed duration and Codex billing usage are unavailable. Repeated checks/environment retries are recorded above.
- No migration or production database deployment is included. **Hold auto-merge:** OPS §2.2 requires separate disposable hosted application/behavior verification for these hydration/mutation changes. Only the production project exists. A new project requires owner organization selection (Supabase tool requirement); any quoted nonzero cost requires agreement. Alternatively, an explicit owner exception must be recorded in the PR before promotion. General implementation approval does not waive this gate.
- Implementation commit: `0c348a5a`; published in [PR #276](https://github.com/Jseow008/ThePlayBook/pull/276). GitHub's file list matches the 25 intended source/test/evidence files. CI is pending; auto-merge remains disabled for the hosted release gate.
- Next: obtain the owner's organization selection for a disposable hosted project (and agreement to any nonzero quote), complete OPS §2.2 candidate application/behavior checks and cleanup, record candidate evidence, then recheck PR scope and enable squash auto-merge. Alternatively, record an explicitly accepted owner exception before promotion. Floating-editor browser verification remains a disclosed limitation.

## Hosted/browser follow-up — 22 October 2026

**Release verdict: HOLD. Hosted checks passed; the desktop floating-editor browser gate is not closed. Auto-merge remains disabled.** Successful individual interactions do not establish a reliable entry point.

Candidate application source: `e354108796ff8882215e19973f9fc6e1b3106a36`. Full sanitized results are in [the evidence summary](evidence/highlight-capture-hosted-2026-10-22.json). Local diagnostic logs were retained outside the repository at `/tmp/netflux-pr276-evidence/raw`; no private credentials or fixtures are retained there.

### Hosted verification and cleanup

- Owner selected Jseow008 and explicitly approved the quoted $10/month project cost. An earlier create call unexpectedly returned a project without cost confirmation; the separate quote showed $10/month. That unused project (`sastpsarhjvrxzkirolk`) was immediately deleted and absence confirmed before cost agreement/recreation. No zero-cost or prorated-total claim is made.
- Authorized candidate: `puybjujvbpghjeojhvnk`; production: `xmuqsgfxuaaophxnwure`. The candidate's isolated link was verified before destructive commands. Full migration replay, guarded reset/replay and final clean dry-run passed. All 14 fingerprint categories match production; fresh public types match after only PostgREST-version normalization.
- Five security SQL checks and DB-002 highlight-preservation behavior passed. Security findings match baseline (private service-only tables and existing search_catalog exceptions). Performance findings are unused indexes on a fresh database and Auth connection allocation. No production migration or schema push is included; production push steps are not applicable.
- Fixtures: three synthetic accounts (two ordinary, one admin), one verified synthetic content item/segment, 52 highlights. The rank-52 target was excluded from the initial 50, resolved independently, and survived reload with its URL retained. Reading position stayed at 900 px before and after opening/closing the Notes drawer, with the destination reference retained.
- Actual ordinary-session API responses: owner 200, other account 404, guest 401, unavailable target 404, explicit Save 200, stale Save 409; newer text was preserved. Browser checks showed the explicit unavailable state, zero marks for the other account, and zero notes in that account's Notes page.
- All seven production-smoke conditions passed over actual HTTP: login rendering, missing-code rejection, Browse, public read, anonymous admin denial, actual admin sign-in/RBAC and shallow/detailed health with database connectivity. Public reader/Browse and account UI were additionally inspected through CUA. The Playwright CLI file was not invoked; browser interaction used the required CUA surface, with an equivalent HTTP smoke harness. No paid model/provider work was dispatched.
- Setup failures were corrected and retained as unsuccessful evidence: an initial runtime inherited an existing snapshot-worker connection. Its attempted synthetic-account snapshot failed the foreign key before insertion; the runtime was stopped. A read-only audit found zero fixture profiles and zero fixture snapshot operations in production. All DB connections were then pinned to the candidate, including its existing restricted worker role. Missing cursor secrets and worker login setup were corrected. Repeated setup requests exhausted the first synthetic account's normal snapshot allowance; the resulting library-sync warning is a limitation of that fixture session, not a waived application test.
- The first smoke assertion incorrectly expected the old heading “Content Dashboard”; the current screen is “Admin Dashboard.” Correcting the harness to the repository smoke test's accepted Admin heading passed without changing application behavior.
- Cleanup completed: both temporary projects deleted and absence confirmed; only production remains listed. Isolated ports 3018/3019 stopped; Chrome test tab closed; Chrome/in-app viewport overrides reset. Synthetic users/data were destroyed with the project. Private keys, tokens, passwords, fixture files, isolated Supabase workdir and candidate-built output were removed.

### Desktop floating editor: findings and confidence

| Reproduction | Expected | Observed / change | Impact and confidence |
| --- | --- | --- | --- |
| Follow a saved link, scroll, open desktop floating controls inside the animated page | Controls remain in the viewport with reader styling | The animated ancestor retained a transform, making fixed positioning relative to that ancestor; an edit button was observed above the viewport. Portal now mounts directly under body, retains reader theme/font classes, is exposed to accessibility, and updates placement as editing/check/conflict status changes | Existing entry point could become unusable; high confidence in observed placement defect and targeted fix |
| Hover a saved passage, activate full controls, then deliver a previously queued preview-end event | Full controls stay open | Added activation propagation protection, protection against preview replacing full controls for the same passage, and a live-mode check before a delayed preview dismissal. Regression delivers the stale event after activation | Prevents stale dismissal; high confidence in automated event coverage; browser activation remains inconclusive overall |
| Edit, press Escape, click outside | Preserve unfinished edits or confirm discard | In successful browser sessions, both kept the floating editor and exact draft open | High confidence for tested sessions; does not close the entry-point gate |
| Navigate away, return and reopen the same floating editor | Recover the correctly scoped unfinished text without saving | Exact marker recovered; server inspection retained newer saved text. Other account could not see the highlight/draft; returning to the owner recovered its unfinished text | High confidence for successful recoveries and API/account isolation |
| Explicit Cancel, then reopen | Remove the draft and show current saved text | Reopened saved baseline; subsequent draft input remained unsaved | High confidence for observed browser cases |
| Keep an older draft, change saved text in a second session, reopen | Show newer saved text and require an explicit recovery choice | Current newer text shown; older draft retained separately; Save disabled until explicit choice. Actual stale PATCH returned 409. A recovery click whose tool response timed out was later observed to have completed; it was not treated as a failed application action | High confidence in conflict handling; tool failures were not counted as passing interactions |
| Repeated entry attempts after final fixes | Reliably open full controls and edit a note | Full controls still intermittently disappear or fail to replace the preview under browser automation. Individual edit/Escape/outside/Cancel/recovery sessions succeeded, but the complete final sequence was not repeatably reliable | **Desktop browser gate NOT PASSED**. High confidence that verification remains incomplete; medium confidence that the residual failure is application behavior because pointer protocol timeouts and viewport changes also occurred |

Chrome's viewport changed during early testing; later pinned to 1440×900 and reset during cleanup. Some activation attempts also failed before editing due pointer protocol timeouts. These limitations are recorded rather than attributed entirely to the product. No physical touch-device or software-keyboard result is claimed.

### Current checkpoint and next action

- Final focused regressions: **79 passed**; lint including policy checks, default production build, Sharp traces (5 routes) and critical CSS passed. Earlier full-suite evidence remains 1,838 passed / 287 skipped and 34 capacity checks; it predates the desktop follow-up. The full suite was not repeated locally for these follow-up UI changes; GitHub validation remains a merge gate.
- Narrow follow-up commits address activation, stale preview dismissal, viewport placement and editor height changes. Temporary diagnostic logging was removed. No automatic note opening, “View saved note,” REA or broader retrieval feature was added.
- One agent; no subagents or application-model/provider benchmarks. Exact elapsed/billing usage is unavailable. Environment and browser retries are recorded above; no efficiency claim is made.
- **Next action:** reproduce the residual activation issue with a stable desktop viewport and event tracing, then rerun the complete floating-editor sequence against one final build. Keep PR #276 unmerged until that browser gate passes. Existing hosted evidence is pinned to the candidate above; rerun affected hosted checks if database-facing behavior changes. The required test project is deleted; do not silently recreate a billable resource.
