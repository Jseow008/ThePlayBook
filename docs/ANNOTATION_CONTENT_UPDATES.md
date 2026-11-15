# Annotation-based content updates

Status: implementation and verification in progress, 15 November 2026.

- Checkout: `/Users/j/.codex/worktrees/annotation-content-updates`, branch `codex/annotation-based-content-updates`, based on `5b66d0b0`.
- Rule: current highlights/attached notes and reflections from any user protect reading text. Without annotations, retain the record ID and requested status. Keep publication history.
- Scope: database enforcement (including legacy direct writes), atomic save routing, admin messaging and save handling, reader revision checks, local upload routing. Existing linked drafts are excluded from consolidation.
- Production exception: the owner explicitly instructed, “Authorised to apply database changes directly to production. We will do the testing in production itself.” This replaces the disposable hosted rehearsal for this release. It does not waive CI, security checks, backups, or verification. Production synthetic tests are rolled back; existing personal records and linked drafts must not be changed.
- Production project: `xmuqsgfxuaaophxnwure`. Latest completed backup verified: 2026-11-14 23:54 UTC. Dry-run contains only `20261115090527_annotation_based_content_updates.sql`.
- Evidence so far: transactional production schema/behavior rehearsal passed and rolled back; TypeScript passed before adding the latest timestamp guard (one subsequent type error corrected); 2,494 application tests passed, 322 database/integration tests skipped without configured runtimes; 34 capacity-harness tests passed; 30 upload tests passed; lint passed.
- Corrected checks: initial SQL assembly included an old schema-move statement, removed before any permanent migration; one synthetic fixture had incomplete Quick Mode data, corrected; build requires a real dependency installation in the isolated checkout because Turbopack rejects the outside-checkout symlink. No production data changes persisted during these checks.
- Pending: finish updated database regression proofs, simultaneous-save proof, generated-type comparison, build and targeted API tests, migration application, post-migration security/data-preservation checks, PR and deployment verification.
- Upload repository: `/Users/j/Desktop/DeepResearchLLM` has substantial pre-existing local edits. Only this task's changes in `content.py`, `test_content.py`, and its workflow documentation may be added; existing work must be preserved. Private before-edit snapshots in `/tmp/annotation-upload-*-before.py` support scope review.

## Production verification completed

Migration `20261115090527_annotation_based_content_updates.sql` is applied. The post-apply dry-run is clean. Existing record fingerprints match the baseline exactly after excluding only the newly added nullable revision columns: 717 content records, 7,114 sections, 43 highlights, four reflections, and 31 existing active linked drafts are unchanged. No consolidation was performed.

Both real simultaneous-save orders passed with independent native database workers. The query interfaces serialize long-running query requests, so attempting to coordinate two workers through those interfaces could not prove overlap; a temporary self-contained pg_cron test provided separate sessions instead. Its jobs, job history, synthetic accounts and content were removed. The first worker harness unscheduled itself too early and was canceled; the corrected idempotent worker is unscheduled after its completed transaction. These harness failures were not counted as successful product checks.

The production-backed browser proof passed desktop same-ID Save as Draft, mobile stale-reflection rejection with entered text retained, saving the refreshed reflection, and saving an annotated revision into a linked draft with the original text, reflection, and publication date preserved. Browser setup was corrected to expand the section and use the current “Capture a reflection” label. No browser page errors were observed. Screenshots remain in the local verification artifacts.

Fresh live database types were used for the affected tables/RPC. Typecheck, lint, build, 2,496 application tests, 34 capacity-harness tests, 30 upload tests and the focused tests pass. The 322 environment-dependent runtime tests skipped by the normal local test command are not claimed as executed; the production SQL/browser/concurrency proofs supply task-specific runtime evidence. CI also runs the updated SQL proof and direct-connection race tests on its disposable database.

Security advisors are unchanged from baseline (12 informational notices for intentionally private tables). Both admin RPC and general function ACL proofs pass. The ACL verifier now recognizes `auth.role() IS DISTINCT FROM 'service_role'`, which safely rejects NULL as well as other roles.

Evidence: [verification record](evidence/annotation-content-updates-20261115.json). Remaining action: publish the scoped PR, pass required checks, merge, and verify the deployed application. The upload changes are already present locally, preserving the repository’s earlier uncommitted work.

A forward migration, `20261115094450_preserve_reading_revision_for_metadata_saves.sql`, avoids temporary graph reordering when submitted reading text is identical. This keeps an open reader’s revision valid during timing-only saves. Its production transactional rehearsal passed the added invariant and the full behavior proof. The already-applied first migration was not edited.
