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

## Validation and release checkpoint

- Focused final regressions: 69 passed. Lint (including policy checks) and typecheck passed. Final default production build, Sharp traces (5 routes), and critical CSS passed.
- Final full suite: **1,838 passed, 287 skipped** (244 files passed, 10 skipped); capacity harness: **34 passed**. Earlier fresh-dependency run had one missing local ffmpeg executable; restoring the existing dependency binary resolved the narration tests. Another run overlapped the build and encountered timing failures; it was stopped, then the final two-worker run passed after the build. No assertions or timeouts weakened.
- Environment retries: dependencies symlinked outside the worktree were rejected by Turbopack; isolated locked dependencies fixed that. A stale artifact briefly lacked an import already fixed in source; clean rebuild and browser retest replaced it. Initial API-test mock sequencing and stricter ref lint were corrected.
- One agent; no application-model/provider calls. Exact elapsed duration and Codex billing usage are unavailable. Repeated checks/environment retries are recorded above.
- No migration or production database deployment is included. **Hold auto-merge:** OPS §2.2 requires separate disposable hosted application/behavior verification for these hydration/mutation changes. Only the production project exists. A new project requires owner organization selection (Supabase tool requirement); any quoted nonzero cost requires agreement. Alternatively, an explicit owner exception must be recorded in the PR before promotion. General implementation approval does not waive this gate.
- Implementation commit: `0c348a5a`; published in [PR #276](https://github.com/Jseow008/ThePlayBook/pull/276). GitHub's file list matches the 25 intended source/test/evidence files. CI is pending; auto-merge remains disabled for the hosted release gate.
- Next: obtain the owner's organization selection for a disposable hosted project (and agreement to any nonzero quote), complete OPS §2.2 candidate application/behavior checks and cleanup, record candidate evidence, then recheck PR scope and enable squash auto-merge. Alternatively, record an explicitly accepted owner exception before promotion. Floating-editor browser verification remains a disclosed limitation.
