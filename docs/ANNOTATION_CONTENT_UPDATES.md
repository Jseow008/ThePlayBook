# Annotation-based content updates

Status: production database rollout complete; application release checks pending.

Checkout: `/Users/j/.codex/worktrees/annotation-content-updates`, branch `codex/annotation-based-content-updates`. PR: https://github.com/Jseow008/ThePlayBook/pull/373. Current main was merged without conflicts; unrelated changes remain outside this PR’s diff.

## Final behavior

- Highlights, attached notes and written reflections from any user protect reading text. Publication history, bookmarks and progress alone do not require linked drafts.
- Without annotations, save to the existing record and honor the requested draft/verified status. Publication history remains intact.
- With annotations, atomically save revised text into a linked draft and preserve the original. Existing separate draft work is not silently overwritten; it must be resumed/reviewed explicitly.
- Direct legacy writes receive database protection too. Normal uploads use the shared atomic routing operation; highlight-replacement overrides are retired.
- Annotation submissions carry the loaded reading revision. Stale submissions are rejected while the entered text stays available. Metadata/timing-only saves keep the reading revision valid.
- Reading text cannot change while narration is processing, retaining the previous safeguard against finalizing old audio onto revised text. Metadata/timing maintenance remains available.
- The 31 existing linked drafts are excluded from consolidation.

## Production authorization and rollout

The owner explicitly instructed: “Authorised to apply database changes directly to production. We will do the testing in production itself.” This is the recorded exception to the repository’s usual disposable hosted gate for this release. CI, security, backup and behavior checks remain required.

Production project: `xmuqsgfxuaaophxnwure`. A completed backup from 2026-11-14 23:54 UTC was verified before rollout. Migrations `20261115090527`, `20261115094450`, and `20261115100520` are applied. Previously applied SQL was not edited. Do not reapply them.

## Evidence

[Verification record](evidence/annotation-content-updates-20261115.json).

- Production transactional rehearsals passed and rolled back before each migration. Post-apply behavior proofs passed: direct edits, requested draft status, publication history, both annotation tables, another user’s annotations, legacy direct-write bypasses, existing-draft conflicts, deletion, metadata/timing revisions, narration processing and permissions.
- Both real concurrent transaction orders passed with independent native database workers. Annotation first produces a linked draft; revision first rejects stale highlights and reflections. Temporary jobs, history, accounts and content were removed.
- Production-backed browser checks passed on a locally served production build: desktop same-ID Save as Draft, mobile stale-reflection rejection with entered text retained, refreshed reflection save, linked-draft redirect, and original text/note/publication-date preservation. No browser page errors. Local screenshots were retained.
- Before/after fingerprints match for all 717 existing content records, 7,114 sections, 43 highlights and four reflections. All 31 active linked drafts remain unchanged.
- Fresh live-generated types match the affected tables/RPC. Typecheck, lint, build, 2,496 application tests, 34 capacity-harness tests, 160 focused tests and 30 companion upload tests passed before the unrelated main merge. Environment-dependent skipped tests are not claimed as executed; CI runs the updated SQL/runtime proofs on its disposable database.
- Admin/function ACL checks passed. Security advisors match the baseline: 12 existing informational notices for intentionally private tables. The ACL verifier recognizes the null-safe service-role check.
- Security Validation and Catalog Search Evidence passed on `875407e8`; the final narration guard and proof are now being added for a final release run.

## Harness corrections and limitations

The query interfaces serialize long-running requests, so they could not establish overlapping transactions. The native-worker proof supplied independent sessions instead. A worker initially unscheduled itself too early and was canceled; the successful idempotent version is unscheduled after completion. The CLI’s local prepared-query path rejected the multi-statement rollback proof; CI now executes it through `pg` without bind parameters. Browser setup was corrected for a collapsed section and the current “Capture a reflection” label. None of these failed harness attempts are counted as successful behavior evidence.

The companion upload repository (`/Users/j/Desktop/DeepResearchLLM`) contains substantial earlier uncommitted work. This task’s changes to `content.py`, `test_content.py` and its workflow documentation preserve that work. Private before-edit snapshots and task-only patches under `/tmp/annotation-*` support scope review; those existing changes are not included in the application PR.

## Next action

Finish the final required PR checks, verify scope again, re-enable squash auto-merge, confirm the production deployment, run the browser proof against the production domain, and update this checkpoint. Do not consolidate linked drafts. One agent performed the work; task-level token usage was not available.
