# Netflux Database Production Readiness

Status: Active
Last verified: 2026-07-29
Scope: Supabase Postgres, Auth, Storage, database-facing application paths, migrations, backup, recovery, and operational readiness.

This document is the single implementation tracker for making the Netflux database reproducible, recoverable, secure, and safe to evolve. It does not replace:

- [`SECURITY_REMEDIATION.md`](./SECURITY_REMEDIATION.md), which records the broader security program.
- [`OPS.md`](./OPS.md), which documents deployment, verification, monitoring, and recovery procedures.
- [`CATEGORY_TAXONOMY.md`](./CATEGORY_TAXONOMY.md), which owns category-model decisions.

## Working rules

1. Do not make dashboard-only schema changes.
2. Do not repair production migration history until the proposed mapping has been proven in a disposable environment.
3. Create every new migration with `supabase migration new <name>`.
4. Every database change must include a rollback or recovery approach and an explicit verification query or test.
5. Run Supabase security and performance advisors after DDL, RLS, function, view, or Storage changes.
6. Keep RLS enabled for every table in an exposed schema. Use explicit grants and policy roles.
7. Never expose the service-role key to a public client.
8. Treat preservation of user-created data as a release blocker.
9. Update this document when an item starts, becomes blocked, or is verified.
10. DB-001 established the repository as the schema source of truth. Any production-only DDL, migration-history drift, or unexplained schema-fingerprint drift reopens DB-001 and blocks later database deployments.

## Status definitions

| Status        | Meaning                                                                |
| ------------- | ---------------------------------------------------------------------- |
| Not started   | No implementation work has begun.                                      |
| In progress   | Work is active, but acceptance criteria have not all passed.           |
| Blocked       | A named dependency or decision prevents progress.                      |
| Verified      | Implementation and all listed acceptance criteria have passed.         |
| Risk accepted | The risk has an owner, reason, review date, and compensating controls. |

## Production-ready exit criteria

Netflux is database-production-ready only when all of the following are true:

- A clean database can be built from the repository without manual dashboard steps.
- Local and production migration histories are intentionally reconciled.
- `supabase db push --dry-run` succeeds and reports no unintended pending migrations.
- Editing or deleting editorial content cannot silently destroy user highlights, notes, or library data.
- No production API exposes an unintended privileged function, table, view, or Storage operation.
- Database and Storage backups exist outside the live project, and a restore drill has passed.
- The Supabase plan, database capacity, Storage capacity, and connection strategy support expected production usage.
- Critical query paths have appropriate indexes and pass representative load tests.
- Advisor warnings are resolved or explicitly risk-accepted with an owner and review date.
- Monitoring and alerting exist for database health, failed jobs, capacity, security events, and recovery failures.

## Verified baseline

The core data snapshot was collected read-only on 2026-07-14; migration parity and security-advisor counts were reverified on 2026-07-22; database size and Storage inventory were reverified during the 2026-07-25 recovery-point refresh. Counts will change over time.

| Area                | Verified state                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Project             | Active and healthy, PostgreSQL 17.6, `ap-south-1`                                                                                               |
| Plan                | Free                                                                                                                                            |
| Database            | 64,474,259 bytes (approximately 64.5 MB)                                                                                                        |
| Public schema       | 20 tables; RLS enabled on all 20                                                                                                                |
| Content             | 474 items, including 406 active verified items and 67 active drafts                                                                             |
| Segments            | 4,813                                                                                                                                           |
| Gemini embeddings   | 4,088 segment embeddings; no missing embeddings for eligible active verified segments                                                           |
| User annotations    | 80 highlights                                                                                                                                   |
| Storage             | 1,013 objects: 261 `audio` and 752 `media`, totaling 1,222,139,218 bytes (approximately 1.22 GB)                                                |
| Security advisor    | 1 warning: leaked-password protection disabled; the 6 public email/token RPC warnings were closed by DB-106                                   |
| Performance advisor | 13 informational unused-index notices; no unindexed foreign key, RLS initialization-plan, or multiple-permissive-policy warning           |
| Migration parity    | 85 matching local/remote versions, no duplicates, and a clean production dry-run with no pending migrations                              |

## Master work tracker

| ID     | Priority | Workstream                                                               | Status                                                          | Production gate |
| ------ | -------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------- |
| DB-001 | P0       | Reconcile migration history and establish a replayable schema            | Verified                                                        | Yes             |
| DB-002 | P0       | Preserve highlights during segment and content updates                   | Verified                                                        | Yes             |
| DB-003 | P0       | Establish production plan, backup, Storage backup, and restore readiness | In progress — restore proven; paid retention and alerts pending | Yes             |
| DB-004 | P0       | Prove a staging or disposable-environment release workflow               | Verified                                                        | Yes             |
| DB-101 | P1       | Correct the Gemini vector index/operator mismatch                        | Verified                                                        | Yes             |
| DB-102 | P1       | Retire or redirect broken legacy embedding RPCs                          | Verified                                                        | Yes             |
| DB-103 | P1       | Optimize and simplify RLS policies                                       | Verified                                                        | Yes             |
| DB-104 | P1       | Add missing foreign-key indexes                                          | Verified                                                        | Yes             |
| DB-105 | P1       | Add core database constraints and invariants                             | Verified                                                        | Yes             |
| DB-106 | P1       | Review public email/token RPC risk acceptance                            | Verified                                                        | Yes             |
| DB-107 | P1       | Configure production Auth, database, and network controls                | In progress                                                     | Yes             |
| DB-201 | P2       | Repair minor data inconsistencies                                        | Not started                                                     | No              |
| DB-202 | P2       | Decide long-term content revision and taxonomy models                    | Not started                                                     | No              |
| DB-203 | P2       | Add capacity, query, and recovery monitoring                             | In progress — implementation complete; activation and launch proof pending | Yes             |

## P0 — Production blockers

### DB-001: Reconcile migration history and establish a replayable schema

Status: Verified — production parity and disposable hosted replay completed on 2026-07-15

#### Initial evidence

- Before reconciliation, the repository contained 70 migration files, while production recorded 37 migration versions.
- Only 28 versions matched; 42 were local-only and 9 were remote-only.
- `20260311000000` was used by two local migration files.
- `004_homepage_section.sql` uses a legacy, non-timestamp migration version. The current CLI recognizes and orders version `004`, and it matches production history, but it must be handled explicitly during reconciliation rather than renamed casually.
- `supabase db push --dry-run` failed because remote migration versions were absent locally.
- Some recent production changes were applied using direct SQL because normal migration push was blocked. This is recorded in [`SECURITY_REMEDIATION.md`](./SECURITY_REMEDIATION.md).
- A normalized content comparison found that all 28 same-version local/remote pairs match after ignoring comments, whitespace, and statement separators. This is useful reconciliation evidence, but a successful disposable replay remains the required proof.
- Each of the 9 remote-only versions has a likely local counterpart. Eight pairs have matching normalized SQL. The highlights pair is related but not equivalent and must not be repaired by assumption.
- After pairing those 9 differently versioned migrations, 33 local-only files required object-by-object classification as applied outside history, superseded, or genuinely pending.
- Read-only catalog checks already show that some absent history entries have live effects. Both files sharing `20260311000000` have their principal objects in production, as does `20260310000000_add_highlight_anchors.sql`. The three `20260624...` security migrations are also documented as applied using direct SQL. Therefore, blindly pushing all local-only files could replay already-live changes or overwrite newer definitions.

#### Historical read-only reconciliation findings — 2026-07-14

The comparison below reads the SQL recorded in `supabase_migrations.schema_migrations`; it does not execute that SQL. "Normalized match" means the recorded and local SQL match after removing comments, whitespace, and statement separators. It is strong mapping evidence, not a substitute for replay and schema comparison.

| Remote version   | Repository file                                          | Historical finding                                            | Resolution                                                                                                                                                 |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260223114843` | `20260223114843_add_user_highlights.sql`                 | The original local file differed from the recorded migration. | Resolved: the repository file now preserves the recorded `updated_at`, `IF NOT EXISTS`, and named-index behavior; clean replay and live comparison passed. |
| `20260223135404` | `20260223135404_update_insert_generated_content.sql`     | Normalized SQL match.                                         | Resolved: aligned to the production-recorded version and proven by replay.                                                                                 |
| `20260224030635` | `20260224030635_add_performance_indexes.sql`             | Normalized SQL match.                                         | Resolved: aligned to the production-recorded version and proven by replay.                                                                                 |
| `20260228172711` | `20260228172711_add_reader_settings.sql`                 | Normalized SQL match.                                         | Resolved: aligned to the production-recorded version and proven by replay.                                                                                 |
| `20260304021450` | `20260304021450_add_get_trending_content.sql`            | Normalized SQL match.                                         | Resolved: aligned to the production-recorded version and proven by replay.                                                                                 |
| `20260621162133` | `20260621162133_audit_admin_definer_runtime_guards.sql`  | Normalized SQL match.                                         | Resolved: aligned to the production-recorded version and proven by replay.                                                                                 |
| `20260621164335` | `20260621164335_add_public_email_subscription_rpcs.sql`  | Normalized SQL match.                                         | Resolved: aligned to the production-recorded version and proven by replay.                                                                                 |
| `20260621164646` | `20260621164646_lock_public_email_table_grants.sql`      | Normalized SQL match.                                         | Resolved: aligned to the production-recorded version and proven by replay.                                                                                 |
| `20260621171404` | `20260621171404_harden_anonymous_activity_analytics.sql` | Normalized SQL match.                                         | Resolved: aligned to the production-recorded version and proven by replay.                                                                                 |

High-risk replay drift identified before reconciliation:

- The live `user_highlights` table had `updated_at`, but the original local creation migration did not add it. This was resolved in `20260223114843_add_user_highlights.sql` and verified by clean replay.
- `20260311000000_add_content_reading_analytics.sql` and the original onboarding migration shared one version. This was resolved by assigning onboarding version `20260311000001` while preserving both changes and their effective order.
- The absence of `20260624083713`, `20260624090733`, and `20260624093402` from migration history does not mean they are pending: [`SECURITY_REMEDIATION.md`](./SECURITY_REMEDIATION.md) records that they were applied with direct SQL while migration push was blocked.

Preliminary local-only triage:

| Classification                                                         | Files                                                                                                                                                                                                                                                                                                                                                                                                                                           | What the current evidence proves                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Principal terminal effect detected in the live catalog or current data | `20260228160316`, `20260310000000_add_highlight_anchors`, `20260311000000_add_content_reading_analytics`, `20260311000000_add_onboarding_state`, `20260312000000`, `20260312010000`, `20260319150000`, `20260401080000`, `20260405093000`, `20260406100000`, `20260407235000`, `20260408000000`, `20260409013000`, `20260507090000`, `20260509090000`, `20260510090000`, `20260518090000`, `20260522100000`, `20260523140000`, `20260614090000` | The expected table, column, view, current function signature, constraint, enum shape, or data-rewrite result is present. This does **not** prove that the exact historical file was applied or that its full definition still matches. |
| Intermediate definition superseded by a later repository migration     | `20260224134000`, `20260303004000`, `20260312020000`, `20260314000000`, `20260315154753`, `20260407235500`, `20260408090000`, `20260409001000`, `20260425090000`, `20260528090000`                                                                                                                                                                                                                                                              | A later migration owns the same function or privilege surface. These files still matter to sequential replay, but should not be compared directly with the final live definition as if they were terminal state.                       |
| Applied outside migration history and documented                       | `20260624083713`, `20260624090733`, `20260624093402`                                                                                                                                                                                                                                                                                                                                                                                            | The security tracker records direct-SQL application and live verification. They require an intentional history/baseline decision, not re-execution.                                                                                    |

This triage accounts for all 33 files after the 9 differently versioned counterpart pairs are removed. The later disposable replay and 13-category metadata comparison completed the definition-level classification.

#### Reconciliation result — 2026-07-14

- The repository now contains 75 uniquely versioned migrations.
- All 9 differently versioned counterpart pairs were aligned to the production-recorded versions. The highlights migration was first amended to preserve the recorded `updated_at`, `IF NOT EXISTS`, and named-index behavior.
- The duplicate onboarding version was resolved as `20260311000001`, preserving both March 11 changes.
- Five missing live prerequisites/effects were captured explicitly: `hero_image_url`, the Vector extension plus `content_item.embedding` and its index, `get_category_stats`, the Gemini embedding invalidation trigger, and the terminal production-baseline reconciliation.
- The terminal reconciliation is fail-closed: it refuses to remove `segment_embedding` if that legacy table contains rows. It also captures existing production ACLs explicitly so new Supabase projects do not depend on historical automatic API-exposure defaults.
- A fresh database built from the repository applied all 75 migrations successfully.
- [`database-schema-fingerprint.sql`](../scripts/database-schema-fingerprint.sql) and [`compare-supabase-schema.mjs`](../scripts/compare-supabase-schema.mjs) verified an exact match across 13 categories: functions, function ACLs, relations, columns, constraints, indexes, policies, relation ACLs, views, triggers, relation comments, required extensions, and Storage bucket configuration.
- All five repository database-security checks passed against the fresh replay and against production.
- The owner authorized the production history mutation in the Codex task. The production operation added 38 already-live/reconciliation records to migration history without executing migration SQL against application schemas or data.
- Production now has 75 unique migration-history rows; local/remote migration parity is exact, and `npx supabase db push --linked --dry-run` reports `Remote database is up to date.`
- Post-operation schema fingerprints still match exactly. Security advisor counts remain 7 and performance advisor counts remain 76, confirming that the history-only operation did not change the advisor surface.
- CI now rejects invalid or duplicate local migration versions, rebuilds the local database from empty, and runs the database security checks. Manual production verification also rejects local/remote version drift or changes to SQL already recorded in production migration history.

#### Production execution and recovery record — 2026-07-14

| Item                             | Record                                                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator                         | Codex, acting under the repository owner's explicit production-mutation authorization                                                                                                          |
| Precondition                     | Production history had exactly 37 rows, latest version `20260708060733`, and none of the 38 repair targets was already recorded                                                                |
| Database backup                  | `~/Backups/Netflux/2026-07-14-db001-pre-repair/`: `roles.sql`, `schema.sql`, `data.sql`, `history_schema.sql`, and `history_data.sql`; private file permissions and SHA-256 checksums verified |
| Storage backup                   | Same backup directory: 246 `audio` objects and 735 `media` objects; 981-file SHA-256 manifest verified against live bucket counts                                                              |
| Production mutation              | One `supabase migration repair ... --status applied --linked --yes` invocation covering the 38 versions listed below                                                                           |
| Application schema/data mutation | None; the operation changed only `supabase_migrations.schema_migrations`                                                                                                                       |
| Post-checks                      | 75/75 parity, dry-run up to date, exact 13-category schema match, five security assertion suites passed, advisor counts unchanged                                                              |
| Rollback                         | Run the same version list with `--status reverted`; use `history_schema.sql` and `history_data.sql` if direct history restoration is required                                                  |

History-repair versions, in order:

```text
20260213000000 20260219000000 20260224134000 20260228160316
20260303004000 20260307000000 20260310000000 20260311000000
20260311000001 20260312000000 20260312010000 20260312020000
20260314000000 20260315154753 20260316000000 20260319150000
20260401080000 20260405093000 20260406100000 20260407235000
20260407235500 20260408000000 20260408090000 20260409001000
20260409013000 20260425090000 20260507090000 20260509090000
20260510090000 20260518090000 20260522100000 20260523140000
20260528090000 20260614090000 20260624083713 20260624090733
20260624093402 20260714000000
```

A restore drill remains owned by DB-003 rather than being inferred from successful backup creation or migration replay.

#### Hosted replay and final production gate — 2026-07-15

- Production remains on the Free plan, where Supabase preview branches are unavailable. The approved substitute was a separate disposable hosted project with an isolated CLI workdir; production data was never copied into it.
- The disposable project replayed all 76 repository migrations from an empty remote database. Remote reset initially exposed migration-session `search_path` assumptions around pgvector types, operators, operator classes, and pgcrypto functions. Historical migrations now schema-qualify those extension objects while terminal function definitions preserve production's exact stored text.
- The schema fingerprint was expanded to cover enum definitions. This found that production already supported `content_type = 'video'` but the historical replay did not. `20260715044322_reconcile_content_type_video.sql` now records that contract with `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.
- The final hosted reset completed from empty, `db push --dry-run` reported the hosted database up to date, and the hosted/production fingerprint matched exactly across 14 categories: functions, function ACLs, relations, columns, constraints, indexes, policies, relation ACLs, views, triggers, relation comments, required extensions, enum definitions, and Storage bucket configuration.
- Fresh production and hosted generated types matched after normalizing only the platform PostgREST metadata version (`14.1` in production and `14.5` in the disposable project). Both exposed the same `content_type` enum, including `video`; repository typecheck passed.
- All five database-security assertion suites passed against the final hosted replay and production. The hosted security advisor returned the six accepted email/token RPC warnings; production returned those six plus the existing leaked-password-protection warning owned by DB-107.
- The hosted performance advisor returned 99 findings on the data-less project: 7 unindexed foreign keys, 32 Auth RLS initialization-plan warnings, 27 multiple-permissive-policy warnings, and 33 unused-index notices. Production remained at 76 findings because only 10 indexes are unused under its real workload.
- A production-mode application build succeeded against the hosted project. Seven browser smoke checks passed with synthetic-only fixtures: login, missing-code callback handling, public browse, public read, anonymous admin denial, authenticated admin RBAC, and shallow/detailed health.
- Before the final production operation, the current 75-row migration history was backed up privately to `~/Backups/Netflux/2026-07-15-db001-hosted-replay/`; file permissions, SHA-256 checksums, and row count were verified.
- Eleven historical rows were refreshed metadata-only so their recorded SQL matches the replay-safe repository files. A dry-run then proposed only `20260715044322`; production applied it with the expected `enum label "video" already exists, skipping` notice.
- Final production verification passed: 76/76 version and recorded-SQL parity, clean dry-run, exact 14-category hosted/production schema match, all five database-security suites, and unchanged advisor surfaces.
- The disposable project and all temporary credentials, generated types, synthetic users, and synthetic content were deleted after evidence collection.

#### Final production execution and recovery record — 2026-07-15

| Item                      | Record                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Operator                  | Codex, acting under the repository owner's explicit production-mutation authorization                                                                                                                                                                                          |
| Precondition              | Production history had exactly 75 rows; only the 11 listed rows had recorded-SQL drift, and dry-run proposed only `20260715044322` after the metadata refresh                                                                                                                  |
| Migration-history backup  | `~/Backups/Netflux/2026-07-15-db001-hosted-replay/`: private `history_schema.sql`, `history_data.sql`, and `SHA256SUMS`; 75 rows and both checksums verified                                                                                                                   |
| History mutation          | The 11 versions below were marked reverted and then applied, refreshing only `supabase_migrations.schema_migrations` from reviewed local SQL                                                                                                                                   |
| Schema mutation           | `20260715044322_reconcile_content_type_video.sql`; idempotent statement observed that `video` already existed, so the live enum did not change                                                                                                                                 |
| Application data mutation | None in production                                                                                                                                                                                                                                                             |
| Post-checks               | 76/76 version and recorded-SQL parity, dry-run up to date, exact 14-category schema match, five SQL security suites passed, advisors reviewed                                                                                                                                  |
| Recovery                  | Revert `20260715044322` in history if its record must be removed; restore the backed-up 75-row history if the metadata refresh must be reversed. PostgreSQL enum labels are not removed automatically, and no enum removal is required because production already had `video`. |

Recorded-SQL refresh versions, in order:

```text
20260220165830 20260220184501 20260223114843 20260303004000
20260312010000 20260408090000 20260507090000 20260521100000
20260528090000 20260621162133 20260622165437
```

#### Required outcome

The repository becomes the canonical, replayable source of database structure and controlled data migrations.

#### Gated implementation outline

Advance one gate at a time. A later gate must not start merely because an earlier command completed.

**Gate A — read-only evidence**

1. Freeze manual production DDL for the duration of reconciliation.
2. Export and preserve the current production schema, migration history, function ACLs, policies, extensions, and Storage bucket configuration.
3. Map every remote-only migration to the corresponding local file or live change using recorded SQL and live catalog evidence.
4. Classify every local-only file as confirmed live outside history, superseded, or genuinely pending. Do not infer the classification from its filename or migration-list position.
5. Record live schema differences that a clean local replay must preserve, beginning with `user_highlights.updated_at` and both changes currently sharing `20260311000000`.

**Gate B — proposal without production mutation**

6. Choose and document one reconciliation strategy:
   - preserve and repair the historical sequence, or
   - establish a reviewed production baseline and archive superseded history.
7. Resolve the duplicate local migration timestamp in the proposed history without losing either change or changing their effective order.
8. Map legacy non-timestamp versions such as `004`, `20260208`, `20260209`, and `20260210` deliberately; do not assume renaming them is safe after they have entered production history.
9. Write down the exact proposed file changes, history changes, commands, expected output, verification queries, failure stops, and recovery procedure. Do not execute the production steps at this gate.

**Gate C — disposable proof**

10. Build an empty local database and a disposable hosted environment entirely from the proposed repository history.
11. Compare tables, columns, constraints, indexes, functions, function ACLs, RLS policies, extensions, and Storage configuration with the intended production state.
12. Run role-based application smoke tests, database tests, and Supabase security and performance advisors.
13. Review every diff. Any unexplained destructive or privilege-expanding diff is a no-go.

**Gate D — explicit production go/no-go review**

14. Verify a fresh database backup, independent Storage copy, restore instructions, maintenance window, named operator, and named reviewer.
15. Review the exact production procedure and disposable evidence. Obtain explicit approval before any migration-history repair, push, or production DDL.

**Gate E — minimal approved production operation**

16. Execute only the reviewed operation, stopping on the first unexpected result.
17. Verify migration parity, schema state, privileges, RLS, advisors, and application smoke tests immediately afterward.
18. Record the final mapping, commands, outputs, operator, reviewer, backup reference, and recovery result in this document.
19. Add CI checks for unique migration versions, immutable applied migrations, clean replay, and local/remote parity.

#### DB-001 go/no-go board

| Gate                      | Current state                                                                                                                                         | Go condition                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Read-only inventory       | Complete                                                                                                                                              | Evidence remains reproducible and no unrecorded production DDL occurs.                                                 |
| Remote-only mapping       | Complete; all 9 mappings reviewed and applied in the repository                                                                                       | Preserve the mapping and do not reuse historical versions.                                                             |
| Local-only classification | Complete through replay and 14-category metadata comparison                                                                                           | Keep the comparison script green as the schema evolves.                                                                |
| Clean local replay        | Complete; the reconciled history reset from empty and the reset is enforced in CI                                                                     | Keep the CI reset and database security checks green.                                                                  |
| Disposable hosted replay  | Complete; all 76 migrations reset from empty and schema comparison, role tests, advisors, generated types, production build, and 7/7 app smoke passed | Repeat the documented DB-004 workflow for every database-facing release.                                               |
| Recovery readiness        | Pre-repair database and independent Storage backups completed; restore drill not run                                                                  | DB-003 completes and records a restore drill.                                                                          |
| Production approval       | Granted by the repository owner for the final history refresh and idempotent enum reconciliation                                                      | Any future production DDL or data mutation requires a new scoped review.                                               |
| Production mutation       | Complete for the approved history refresh and `20260715044322`                                                                                        | Post-checks remain green; production already contained the `video` label, so no live enum or application data changed. |

#### Acceptance criteria

- [x] Every migration filename has a unique version.
- [x] All 9 former remote-only versions have a reviewed mapping supported by recorded SQL and replay evidence.
- [x] All 33 former local-only files are classified as confirmed live outside history or superseded.
- [x] A clean replay preserves `user_highlights.updated_at` and both former `20260311000000` changes under unique versions.
- [x] `npx supabase db reset` succeeds from an empty local database.
- [x] A disposable hosted environment can be created entirely from repository migrations and configuration.
- [x] Schema, functions, grants, RLS policies, indexes, and constraints match the intended production state.
- [x] `npx supabase db push --linked --dry-run` succeeds and reports no pending changes.
- [x] Migration parity was checked before and after both production history operations.
- [x] CI validates unique migration versions and clean replay; manual production verification validates version parity and recorded-SQL immutability.
- [x] The reconciliation procedure and production history repair are recorded in this document.

#### Safety notes

- Do not blindly run the repair commands suggested by the CLI.
- During future reconciliation work, do not run `supabase migration repair`, `supabase db push`, production DDL/DML, or any tool that applies migrations until the corresponding evidence and recovery gates are satisfied.
- Do not change or rename historical migration files until the proposed mapping and replay strategy have been reviewed. Preserve evidence before any local history rewrite.
- Do not treat an idempotent statement as harmless: replaying an already-live migration can still replace function bodies, grants, policies, defaults, or constraints with older definitions.
- Take a database backup before changing production migration history.
- Migration-history repair must not be treated as proof that the schema itself matches.
- Stop immediately if an unexpected command proposes a drop, destructive rewrite, privilege expansion, policy removal, or user-data mutation.

### DB-002: Preserve highlights during segment and content updates

Status: Verified — production rollout and post-rollout integrity audit completed on 2026-07-15

#### Evidence

Before DB-002, the production `admin_update_content_graph` deleted all segments for a content item and reinserted them. Because `user_highlights.segment_id` uses `ON DELETE CASCADE`, a normal editorial save could delete highlights even when the replacement segment reused the same UUID.

The former production function copied Gemini embeddings into a temporary table and restored UUID-matched embeddings after the segment replacement. That partially mitigated cascade loss for generated embeddings, but it did not preserve highlights or make delete-and-reinsert safe for user-created data.

The pre-rollout production audit found 79 highlights, all 79 linked to a segment, across 43 segment UUIDs, with no orphaned segment references. Production was queried read-only and was not mutated during implementation or verification.

Migration `20260715052003_preserve_highlights_during_admin_graph_updates.sql` replaces destructive segment replacement with an in-place reconciliation under row locks. It retains submitted segment UUIDs, handles reorder collisions through a temporary negative order range, inserts genuinely new segments, removes only omitted unhighlighted segments, and fails closed with `DB002_HIGHLIGHTED_SEGMENT_REMOVAL` when an omitted segment has highlights. The function keeps its service-role runtime guard, uses an empty `search_path`, validates submitted UUID ownership, and preserves the existing least-privilege execute grants.

The admin update route maps the stable database rejection to HTTP 409 with a segment-level field error. This prevents a safe database refusal from surfacing as an unexplained server error.

Verification completed before production rollout:

- all 77 repository migrations replayed from empty locally and in final disposable hosted project `kcjzvhahfioexwgwgmup`;
- the final transactional regression proof passed locally and on the hosted project for edit, reorder, add, highlighted-removal rejection, unhighlighted removal, UUID/highlight preservation, embedding invalidation/preservation, verified-only embedding cleanup when content returns to draft, and explicit content/segment/artifact/embedding/highlight rollback assertions;
- all five SQL security suites, typecheck, repository lint, 137 focused security/API tests, the full 851-test suite, and a production build passed;
- Supabase database lint reported no DB-002 finding; one unrelated pre-existing notification-function lint remains outside this change;
- candidate and production generated types matched after normalizing only Supabase PostgREST metadata; the schema inventory differed in exactly the intended `admin_update_content_graph` definition;
- hosted security advisors reported only the six accepted email/token RPC warnings, while performance findings remained in the existing DB-103/DB-104 backlog categories;
- all 7/7 hosted application smoke checks passed using synthetic-only fixtures;
- the disposable project, synthetic data, credentials, isolated server, and temporary workdir were deleted after verification;
- the final pre-rollout production dry-run proposed exactly `20260715052003_preserve_highlights_during_admin_graph_updates.sql` and no other migration.

Production rollout verification completed on 2026-07-15:

- a fresh Supabase-compatible roles, schema, and 50.95 MB data backup was written outside the repository to `/Users/j/.codex/backups/Lifebook/db002-production-20260715T061325Z`; the data dump contains `segment`, `segment_embedding_gemini`, and `user_highlights`, and the checksums and 79-highlight/43-segment baseline are recorded in its mode-`0600` manifest;
- migration `20260715052003_preserve_highlights_during_admin_graph_updates.sql` was applied once with reviewed SHA-256 `6b811fb6174dd15bb07a4de250d62426185ea86eb5179d28c8e5443389baa85c`;
- the immediate and final post-rollout audits remained at 79 highlights, all 79 linked across 43 segment UUIDs, with zero orphaned references and zero negative segment order indexes;
- the production dry-run is clean, all 77 migration versions match, and the production/local schema fingerprint matches across all 14 tracked categories;
- the function remains `SECURITY DEFINER` with an empty `search_path`; `PUBLIC`, `anon`, and `authenticated` cannot execute it, while `service_role` can;
- all five production SQL security suites passed; database lint reported no DB-002 issue and retained only the unrelated notification-function type-cast finding;
- production advisors remained at the documented seven security findings and 76 performance findings, with no DB-002 regression;
- a short-lived production-connected admin API smoke used synthetic draft fixtures only: retaining the highlighted segment returned HTTP 200, omitting it returned HTTP 409, rollback preserved the segment and highlight, and cleanup left zero synthetic users, content items, or highlights;
- the public production browser smoke passed six checks; the authenticated-admin browser check remained skipped because no persistent smoke credential is configured. A direct temporary login at the production edge was concealed with the expected HTTP 404 by the admin IP allowlist, which was not bypassed or weakened.

Application rollout verification completed on 2026-07-15:

- the isolated two-file application change was committed as `7735c8f97e4c2f73a9438f51f1ec31d952b12027` (`Handle highlighted segment removal conflicts`), containing only the admin-route HTTP 409 mapping and its API regression test;
- the focused 27-test API suite, typecheck, lint, all 851 repository tests, production build, and production dependency audit passed before deployment;
- Vercel preview deployment `dpl_LYfgyPWJuy4GZoYkyDbm5rDHZLBD` reached `READY`, and its root and health endpoint returned HTTP 200 while the admin route retained the expected allowlist 404;
- the exact commit was fast-forwarded onto `main`; production deployment `dpl_J9cmZjV5cPYBiLDr5EthCkyJHk4d` reached `READY` and was assigned to `www.netflux.blog`, `netflux.blog`, and the configured Vercel aliases;
- post-deployment checks returned HTTP 200 for login, browse, a known public preview, and `/api/health`; Vercel reported no runtime error clusters and no error/fatal logs for the deployment;
- the live integrity re-audit remained at 79 highlights, all 79 linked across 43 segment UUIDs, with zero orphaned references and zero negative segment order indexes; the DB-002 migration is recorded exactly once and the linked migration dry-run remains clean;
- the production branch's base smoke test initially exposed a pre-existing strict-locator defect where `main.or(body)` matched both visible elements on browse/read pages. Those requests were already HTTP 200, and the working tree's pending `.first()` correction then produced the expected result: six checks passed and only the authenticated-admin check was skipped. An independent browser check also confirmed HTTP 200 and visible bodies for both routes;
- one final user-path check remains: from a genuinely allowlisted, authenticated production admin session, retain a highlighted segment and confirm success, then omit it and confirm HTTP 409 with the highlight intact. No such existing session was available during this rollout, and the IP allowlist was not bypassed, spoofed, or weakened.

#### Required outcome

Editorial operations never silently delete user annotations.

#### Preferred near-term design

Diff segments by stable UUID inside one transaction:

- update existing segments in place;
- insert genuinely new segments;
- explicitly handle removed segments according to an approved retention rule;
- preserve highlight anchors when the referenced segment survives;
- block or deliberately migrate highlights when a referenced segment is removed.

Immutable content revisions remain a valid longer-term design, but are not required to fix the immediate data-loss risk.

The existing embedding-preservation code is useful evidence for identifying stable segment UUIDs. It should not be copied as the default highlight solution: updating surviving segments in place avoids deleting and recreating user records, while removed highlighted segments still require an explicit product decision.

#### Acceptance criteria

- [x] Updating segment text while retaining its UUID preserves all attached highlights.
- [x] Reordering segments preserves all attached highlights.
- [x] Adding a segment does not affect existing highlights.
- [x] Removing a highlighted segment follows an explicit, tested product rule: block the save until the highlighted segment is retained or a separate retention workflow is approved.
- [x] A failed graph update rolls back content, segments, artifacts, embeddings, and highlight changes atomically.
- [x] Automated regression tests cover all cases above.
- [x] The pre-rollout audit records 79 highlights across 43 segment UUIDs with no orphaned references.
- [x] The same highlight/segment integrity audit passed immediately and again after production rollout.

#### Safety notes

- Avoid testing destructive behavior on production user data.
- Preserve the 2026-07-15 pre-change backup and its manifest until the retention period is formally defined under DB-003.
- Segment-replacing editorial saves are database-safe after the verified rollout. Keep stable segment UUIDs and treat `DB002_HIGHLIGHTED_SEGMENT_REMOVAL` as a required conflict, not as a retryable server failure.
- The HTTP 409 conflict mapping is deployed in application commit `7735c8f`. Complete the remaining authenticated user-path check from an actually allowlisted production admin session when one is available; do not weaken the IP allowlist for smoke testing.
- Continue auditing highlight/segment integrity after future changes to segment persistence, highlight anchoring, content revisioning, or embedding lifecycle rules.

### DB-003: Establish production plan, backup, Storage backup, and restore readiness

Status: In progress — recovery targets, independent Storage verification, a local restore drill, production bucket controls, and a fresh 2026-07-25 manual recovery point are complete; paid-plan retention, PITR, automated cadence, and alerts remain

#### Evidence

- The linked organization is on the Free plan.
- Production contains 1,013 Storage objects: 261 in `audio` and 752 in `media`, totaling 1,222,139,218 bytes (approximately 1.22 GB) as of the 2026-07-25 recovery-point refresh.
- Free projects do not provide the production availability and automatic-backup posture required by this project.
- Database backups contain Storage metadata, not the underlying Storage objects.
- `supabase backups list` again reported no retained physical backups visible to the project, `pitr_enabled: false`, and `walg_enabled: true` on 2026-07-17. WAL archiving capability without a retained, restorable backup or PITR window does not satisfy the launch RPO.
- The production database measured 64,228,499 bytes (approximately 61 MiB) on 2026-07-17.
- Both production buckets remain public and now enforce the existing server-side upload contracts: 5 MiB with JPEG, PNG, WebP, GIF, and AVIF for `media`; 50 MiB with MPEG/MP3, WAV, and M4A MIME variants for `audio`.
- Migration `20260715110000_enforce_storage_bucket_upload_limits.sql` was deployed on 2026-07-16 after a fresh roles/schema/data backup and configuration snapshot, an exact two-migration dry-run, and explicit authorization. Production remained at 246 `audio` objects and 735 `media` objects totaling 1,146,837,837 bytes, with zero incompatible objects. Migration history and recorded SQL match at 79/79, all 14 schema fingerprint categories match the fully replayed local database, all five recurring production security suites passed, and public application/RPC smoke checks passed.
- The independent Storage copy at `~/Backups/Netflux/2026-07-14-db001-pre-repair/storage` contains the same 981 objects and 1,146,837,837 bytes as production. All 981 entries in `storage.sha256` passed SHA-256 verification on 2026-07-15.
- The DB-002 logical backup at `~/.codex/backups/Lifebook/db002-production-20260715T061325Z` passed its recorded SHA-256 checks and was restored into an isolated local Supabase stack using current platform images. Recovered highlight, embedding, Auth, role, and Storage-metadata invariants passed; six application smoke checks passed, including synthetic-admin login, and the fixture and stack were destroyed afterward. [`OPS.md`](./OPS.md) records the drill and its local-only asset-host accommodation.
- A fresh manual recovery point completed on 2026-07-17 without production mutation. `~/.codex/backups/Lifebook/db003-production-20260717T085243Z` contains mode-`0600` role, schema, and 49-section data dumps plus a passing SHA-256 manifest. `~/Backups/Netflux/2026-07-17-db003-recovery/storage` contains all 246 `audio` and 735 `media` objects. Its 981-entry SHA-256 manifest passed, and the counts and 1,146,837,837-byte total match the live production inventory exactly. This refresh restores a current manual recovery point but does not satisfy the required automated cadence or hosted retention.
- A second manual recovery-point refresh completed on 2026-07-25 without production mutation. `~/.codex/backups/Lifebook/db003-production-20260725T042740Z` contains owner-only role, schema, and 49-section data dumps; all three SHA-256 checks passed. `~/Backups/Netflux/2026-07-25-db003-recovery/storage` contains 261 `audio` and 752 `media` objects. Production inventories taken before and after the copy matched the local 1,013-object, 1,222,139,218-byte inventory exactly, and all 1,013 object hashes passed. This refresh re-establishes a current manual recovery point but still does not satisfy the automated cadence, hosted-retention, or alerting gates.

#### Recovery objectives and retention policy

- **Database RPO:** no more than 24 hours of committed data loss before public launch. Move to one hour or better through PITR only when revenue, meaningful usage, write volume, or the cost of losing up to 24 hours of data justifies the additional recurring spend.
- **Storage RPO:** no more than 24 hours of new or changed object loss before public launch.
- **Service RTO:** restore database access, required Storage objects, public browse/read, and admin access within four hours of declaring a recoverable incident.
- **Retention:** retain at least 30 daily database and independent Storage recovery points plus 12 monthly recovery points. Keep the 2026-07-14, 2026-07-15, 2026-07-16, 2026-07-17, and 2026-07-25 recovery points until this automated policy has operated successfully for 30 days.
- The current manual-only database export cadence and disabled PITR do **not** meet the launch RPO. The gap is accepted temporarily while the product remains pre-revenue with minimal usage, but DB-003 must remain In progress and the project must not be represented as launch-ready under this posture.

#### Proportionate staged posture

- **Current pre-revenue stage:** remain on Free and spend USD 0 on PITR. Keep verified manual recovery points, refresh them before database-facing releases and other risky operations, and explicitly accept that this does not provide the launch RPO or production availability. Production Storage currently totals approximately 1.22 GB against the documented 1 GB Free quota, so reduce usage below quota or upgrade before service restrictions become a risk.
- **Public-launch stage:** upgrade to Pro with the Spend Cap enabled and retain the default Micro compute unless measured load requires more. Current Supabase documentation lists Pro at USD 25 per month, includes USD 10 of compute credit for one default Micro project, provides seven days of automatic daily backups, and includes 100 GB of Storage. Confirm the checkout total and applicable tax before purchase because pricing can change.
- Continue daily off-platform logical database and Storage recovery points at launch, retaining 30 daily and 12 monthly recovery points. Hosted daily backups provide rapid platform recovery; independent copies protect against project deletion and Storage-object loss.
- **Scale trigger:** add Small compute and seven-day PITR only when losing up to 24 hours of writes becomes commercially or operationally unacceptable. Current documentation prices this combined posture at approximately USD 130 per month after compute credit and describes a worst-case PITR RPO of two minutes.
- Configure capacity and cost checks for database/disk size, Storage size, egress, backup freshness, and the upcoming invoice. Supabase Spend Cap is useful protection but explicitly does not provide fine-grained budgets or threshold notifications, and PITR charges are not covered by the Spend Cap.
- Keep DB-003 In progress until the launch-stage plan is approved, the off-platform destination and credentials are approved, the first automated recovery point and restore proof pass, and alert delivery is tested.

#### Storage lifecycle and orphan policy

- Treat referenced `audio` and `media` objects as immutable; replacements use new object keys so rollback remains possible.
- Produce a weekly orphan report by comparing Storage object keys with live database references. Reporting is read-only and must not delete objects automatically.
- Quarantine an apparent orphan for at least 30 days. Delete only after a current independent copy is verified and an operator and reviewer approve the candidate list.
- Retain objects associated with soft-deleted content during the same quarantine period. A database row deletion must never be the sole trigger for immediate object deletion.
- Run the independent object copy at least daily before launch, retain it according to the recovery policy above, and monitor copy freshness and checksum failures.

#### Required outcome

The production environment has documented capacity, database recovery, Storage recovery, and tested restore procedures.

#### Acceptance criteria

- [ ] The production project is on an approved paid plan before public launch.
- [ ] Database backup retention satisfies the documented recovery point objective (RPO).
- [x] Recovery time objective (RTO) is documented.
- [x] PITR is enabled or explicitly risk-assessed against the required RPO. PITR is disabled and the current risk is rejected for public launch.
- [x] Audio and media objects are copied to an independent backup destination and checksum-verified.
- [x] Bucket-specific MIME-type and file-size restrictions are configured.
- [x] Storage lifecycle and orphan cleanup rules are documented.
- [ ] Spend, database size, Storage size, and egress alerts are configured.
- [x] The restore drill in [`OPS.md`](./OPS.md) is completed and recorded.

### DB-004: Prove a staging or disposable-environment release workflow

Status: Verified — disposable hosted replay and two-layer deployment enforcement passed a normal gated production release on 2026-07-15

#### Verified workflow evidence

- Because production is on the Supabase Free plan, the verified path uses a separate short-lived hosted project and an isolated CLI workdir. A paid preview branch can replace that project when the plan supports branching.
- [`OPS.md`](./OPS.md) records the repeatable creation, replay, comparison, security, type-generation, application-smoke, go/no-go, and cleanup procedure.
- The first full run applied all 76 migrations in version order, then proved a destructive remote reset from empty on the disposable project. No production data, user identities, or Storage objects were copied; only synthetic fixtures were created after replay.
- The hosted and production schemas matched across all 14 fingerprint categories. Fresh generated types matched after normalizing only the platform PostgREST metadata version, and repository typecheck passed.
- Five direct SQL role/security suites, Supabase security and performance advisors, a production build, and all seven application smoke tests passed on the final hosted state.
- Production was not allowed to proceed until the hosted gate passed, a fresh migration-history backup was verified, a production dry-run proposed only the reviewed idempotent migration, and explicit authorization existed.
- The exact successful GitHub check contexts are `validate` and `Security Validation`.
- Before enforcement was configured, Vercel created production deployment `dpl_DvWR7arw13fWwLyosk1A268wWHyE` for commit `f1ac98a` before `validate` completed. This proved that successful checks without an explicit promotion gate did not protect production traffic.
- Repository ruleset `18984223` is active for `refs/heads/main`. It has no bypass actors, requires a pull request, requires both exact GitHub Actions checks with strict up-to-date evaluation, and blocks branch deletion and non-fast-forward updates. The active branch-rules endpoint returned the same four rules after creation.
- Vercel Deployment Checks now import the exact GitHub checks `validate` and `Security Validation`, with Production behavior for both. Vercel confirmed that the checks take effect on the next production deployment, and a full page reload preserved both saved checks.
- Pull request [#14](https://github.com/Jseow008/ThePlayBook/pull/14) provided the safe protected-branch challenge. GitHub reported the PR blocked while the required checks were pending or failing, then reported it mergeable only after `validate` and `Security Validation` succeeded. The SHA-locked squash merge completed at `2026-07-15T13:23:51Z`; no failing production deployment was manufactured.
- The resulting production build, Vercel deployment `dpl_FC63uQEfQTb3q2rsVT3CwiSf6EaJ` for commit `b6f5f424cd1fae790a46b0c4ca167db3c84ea8b2`, reached build state `READY` at `2026-07-15T13:25:41.259Z` while both live domains remained assigned to the prior deployment.
- `Security Validation` completed successfully at `2026-07-15T13:27:21Z`. The first `validate` run failed at `2026-07-15T13:40:17Z`, and Vercel continued withholding `netflux.blog`, `www.netflux.blog`, and `netflux-zeta.vercel.app` from the new build. This proves the production failure path remained closed even though the build itself was ready.
- The single failed-job rerun of `validate` completed successfully at `2026-07-15T13:57:16Z`. At `2026-07-15T13:57:30.141Z`, the first post-success observation showed all three production aliases on the new deployment. `netflux.blog`, `www.netflux.blog`, and `/api/health` then returned HTTP 200, and resolving `netflux.blog` through Vercel identified the expected deployment and commit.

#### Required outcome

Every migration and database-facing release can be tested without using production data or modifying production first.

#### Acceptance criteria

- [x] A persistent staging project or approved disposable hosted-project/branch workflow exists.
- [x] Migrations run automatically in version order.
- [x] Seed data contains no production personal data or secrets.
- [x] Security and performance advisors run after migrations.
- [x] Database types are regenerated and typechecked when schema contracts change.
- [x] Public, authenticated, admin, and service-only access paths are smoke-tested.
- [x] The production deployment is configured to require both `validate` and `Security Validation` before production promotion.
- [x] A normal production release proved promotion waits for both checks, including withholding promotion after a failed required check; the same PR proved the protected branch remains blocked until required checks pass.

## P1 — Required hardening

### DB-101: Correct the Gemini vector index/operator mismatch

Status: Verified — cosine retrieval is live in production with migration parity, unchanged embedding and relevance fingerprints, observed HNSW scans, clean security checks, and healthy application smoke

#### Evidence

- Before remediation, the production HNSW index used `vector_ip_ops`.
- The active Gemini matching query uses cosine distance through `<=>`.
- Before remediation, a live `EXPLAIN` chose a sequential scan and sort instead of the HNSW index.
- Production runs PostgreSQL 17.6 with pgvector 0.8.0 and contains 4,088 non-null 768-dimensional Gemini embeddings.
- The live vector L2 norms range from approximately 0.576 to 0.605, averaging 0.591. The embeddings are not unit-normalized, so changing the query to inner product would change ranking semantics; cosine remains the required contract.
- Five users currently have eligible embedded libraries ranging from 17 to 1,124 segments, averaging 465.6 segments.
- Migration `20260717101501_align_gemini_cosine_index.sql` replaces the mismatched index with `vector_cosine_ops`. The normal retrieval path retains direct ascending `<=>` ordering, uses strict iterative HNSW scanning with `ef_search = 200`, and gives the function a scoped `enable_seqscan = off` setting because the planner continued choosing the sequential path at the current table size despite the compatible index. The same function-scoped setting also applies to completion-boosted calls; representative restored-data testing measured that exact branch at approximately 18.9 ms per call and found no relevance change.
- Completion boosting obscures the direct distance ordering. That uncommon branch deliberately preserves the existing exact full-library reranking instead of changing relevance through a truncated approximate candidate set.
- The migration replayed from empty locally. Its transactional regression check proves the cosine operator class and index eligibility, preserves normal cosine order, preserves completion-boosted order and similarity, and removes all synthetic fixtures.
- The verified 2026-07-17 production recovery snapshot was loaded into the isolated local database for representative comparison. With the exact sequential path, 20 top-12 searches took approximately 420.5 ms total; the index-backed path with `ef_search = 200` took approximately 66.9 ms total. These are isolated warm-cache comparative measurements, not a production latency SLO.
- Across 97 query vectors sampled from all five recovered user libraries, the index-backed path matched the exact top-12 result set and order for every query. `ef_search = 100` produced one ordered mismatch and was rejected.
- A short-lived $0 Supabase project in `ap-south-1` replayed all 80 repository migrations in order on PostgreSQL 17.6 with pgvector 0.8.2. The resulting catalog uses `vector_cosine_ops` and records the intended strict iterative scan, `ef_search = 200`, and function-scoped sequential-scan setting.
- Eight hosted SQL suites passed: function ACLs, admin RPC ACLs, embedding-table reads, Storage bucket listing, analytics RLS, DB-101 vector behavior, DB-002 highlight preservation, and publication timestamps. Type generation also succeeded and all DB-101 fixtures were absent after the check.
- Hosted advisors introduced no security finding. Empty-project unused-index notices were expected because the project contained no application traffic; importantly, the previous unused Gemini HNSW index finding was absent. The temporary project was deleted after verification, and the organization again contains only production.
- PR #21 passed `validate`, `Security Validation`, and Vercel and was squash-merged as `1f852a6`. A fresh private roles/schema/data backup and SHA-256 manifest were completed before an exact production dry-run showed only `20260717101501_align_gemini_cosine_index.sql`.
- The authorized migration applied successfully. Production is 80/80 with a clean post-deployment dry-run. The canonical index is valid, ready, live, and uses `vector_cosine_ops`; the function records strict iterative scans, `ef_search = 200`, and its scoped sequential-scan setting.
- All 4,088 768-dimensional embeddings remained present and non-null. The embedding fingerprint remained `761f16ca8edf90eb98a7f3d2f5439400`; user-library and content counts also remained at their immediate pre-deployment values of 237 and 524.
- The ordered relevance fingerprint for 97 real queries across all five libraries remained `d8321cd35f0e72858640fc8da8afae05`. Twenty-five completion-boosted queries had zero ordered mismatches against exact full-library reranking.
- The new HNSW index recorded 97 scans and 21,148 tuples read/fetched during production verification. Five read-only security suites passed. Security advisors remained at the same seven pre-existing findings; performance findings decreased from 76 to 75 and the unused Gemini index finding disappeared.
- Remote lint continues to report only the pre-existing enum/text error in `queue_content_request_published_notifications`. Seven public routes returned HTTP 200, the project remained `ACTIVE_HEALTHY`, and post-release Postgres logs contained no migration or application error.

#### Required outcome

The query distance operator, similarity calculation, and HNSW operator class describe the same metric.

#### Acceptance criteria

- [x] The chosen metric is documented.
- [x] The reviewed migration uses `vector_cosine_ops` for the cosine contract.
- [x] The isolated restored-data benchmark records HNSW index scans under the intended function settings.
- [x] Retrieval relevance is regression-tested against exact cosine ranking, including the completion-boosted branch.
- [x] Query latency is measured with representative recovered library sizes.
- [x] The complete migration history and DB-101 checks pass in a disposable hosted Supabase project.
- [x] The migration is deployed through the gated workflow and passes post-deployment parity, relevance, plan, advisor, and application smoke checks.

#### Sequencing note

Design, migration authoring, and staging benchmarks may proceed in parallel with DB-003 and DB-004. Production deployment must use the reconciled migration workflow from DB-001; applying this directly with untracked SQL would deepen the existing drift.

### DB-102: Retire or redirect broken legacy embedding RPCs

Status: Verified — migration `20260717152805_retire_legacy_embedding_rpcs.sql` deployed and verified in production on 2026-07-18

#### Evidence

- A live `to_regclass('public.segment_embedding')` check confirms that `segment_embedding` does not exist in production.
- Before DB-102, historical migrations created `segment_embedding` without a final explicit retirement migration. Migration `20260717152805_retire_legacy_embedding_rpcs.sql` now records the intended end state and fails closed if an unexpected environment contains legacy rows.
- Before deployment, `match_library_segments` and `get_segments_missing_embeddings` still referenced the absent table, and `match_library_segments` remained executable by authenticated users despite failing at runtime.
- The application stopped calling `get_segments_missing_embeddings` on 2026-03-13 when the admin sync workflow moved to `get_segments_missing_gemini_embeddings`, 768-dimensional Gemini embeddings, and `segment_embedding_gemini`.
- Current application code and scripts contain no callers of either legacy RPC. Production contains no dependent routines, triggers, Cron jobs, or Edge Functions, and recent API/Postgres logs contain no legacy invocation.
- Retained `pg_stat_statements` history since project creation contains seven old PostgREST calls to `get_segments_missing_embeddings` and no call to `match_library_segments`; those calls are consistent with the retired pre-Gemini admin workflow.
- The selected end state is removal rather than compatibility redirection: forwarding a 1536-dimensional matching contract to the 768-dimensional Gemini function would be misleading and unsafe, while the maintenance caller already has a direct Gemini replacement.
- All 81 migrations replay from empty locally. The final schema contains neither the legacy table/indexes nor the two public RPCs, while the Gemini table and RPCs remain available.
- Generated database types contain only the Gemini contracts. The authenticated Gemini matching path and both service-role maintenance/coverage paths pass direct local role smoke tests.
- All nine local SQL security/database suites, 853 application tests, typecheck, lint, and migration-version validation pass.
- A short-lived $0 Supabase project in `ap-south-1` replayed all 81 migrations in order on PostgreSQL 17.6. The same nine SQL suites passed, generated hosted types contained no legacy RPC contract, and the project remained `ACTIVE_HEALTHY`.
- Hosted security advisors reported only the six intentional public email/token RPC warnings. Empty-project performance findings were confined to later roadmap work and unused indexes without traffic; DB-102 introduced no new security finding.
- The disposable project was deleted after verification, returning the organization to its production-only state.
- Immediately before production deployment, a schema, roles, and migration-history metadata snapshot was written to `/Users/j/.codex/backups/Lifebook/db102-production-20260718T054021Z`, including SHA-256 checksums. The production dry-run proposed exactly `20260717152805_retire_legacy_embedding_rpcs.sql`.
- The gated migration was applied successfully. Production now has 81 matching local/remote migration versions, and the post-deployment dry-run reports `Remote database is up to date`.
- Production catalog verification finds no legacy table, indexes, or RPCs. The four active Gemini functions retain their intended authenticated/service-role ACLs; neither anonymous role access nor the retired execute grants remain.
- All 4,088 Gemini embeddings retained the same pre/post fingerprint (`4703328d326c04c8af08e4a69c739e96`). Immediate pre/post checks also retained 238 library rows and 524 content rows.
- Production remained `ACTIVE_HEALTHY`; the homepage, health endpoint, Browse, Ask, and canonical `www` URL all returned HTTP 200. Post-deployment Postgres and API logs contained no errors.
- Production security advisors remained unchanged at 7 known warnings and performance advisors remained unchanged at 75 existing findings. Remote lint surfaced only the pre-existing, unrelated enum/text error in `queue_content_request_published_notifications`.

#### Acceptance criteria

- [x] Application, scripts, database dependencies, scheduled jobs, Edge Functions, retained statement statistics, and recent logs are audited for both legacy RPC names.
- [x] Unused RPCs are dropped and their execute grants disappear.
- [x] No compatibility RPC is required; active callers already use the dimensionally correct Gemini APIs.
- [x] A clean rebuild and production agree on whether the legacy table and its indexes exist; both contain neither.
- [x] Generated database types no longer advertise broken contracts.
- [x] Authenticated and service-role smoke tests pass locally and in the disposable hosted gate.

### DB-103: Optimize and simplify RLS policies

Status: Verified — migration `20260718062617_optimize_rls_policies.sql` is live in production

#### Evidence

- The 2026-07-18 production catalog audit found 20 public tables and 48 policies. RLS is enabled on all 20 tables, and every table has at least one policy.
- 32 policies across 11 tables trigger Auth RLS initialization-plan warnings because `auth.uid()` or `auth.role()` is evaluated per row rather than through an init plan.
- 27 multiple-permissive-policy warnings affect `content_request_votes`, `content_requests`, and `user_notification_preferences`. Every warning includes one of the redundant service-role policies that currently targets `PUBLIC`.
- Exactly four live policies still call deprecated `auth.role()`. All four are redundant service-role policies on request/notification tables, and production confirms that `service_role` has `BYPASSRLS`.
- Six additional policies explicitly grant unconditional access to `service_role`. These are also redundant because that role bypasses RLS, bringing the removable service-role-policy total to 10.
- 28 policies target `PUBLIC`: 6 intended public-read policies, 18 authenticated ownership/admin policies, and the 4 redundant `auth.role()` service policies. The intended end state gives public reads explicitly to `anon, authenticated`, ownership/admin policies explicitly to `authenticated`, and removes the 4 redundant service policies.
- Five UPDATE policies have `USING` but omit an explicit `WITH CHECK`: `content_feedback`, `homepage_section`, `reading_activity`, `user_highlights`, and `user_library`. PostgreSQL currently derives the check from `USING`, so the audit found no present ownership bypass; DB-103 will make the invariant explicit.
- The service-only `admin_content_workbench_readiness` view is owned by `postgres` and is not a security-invoker view, but neither `anon` nor `authenticated` can select it. It is not currently readable by the Data API roles; defense-in-depth treatment remains part of migration review.
- If the migration produces no new finding, removing the 10 redundant service-role policies and rewriting the remaining 28 auth-function policies should reduce performance-advisor findings from 75 to 16: the 7 DB-104 foreign-key findings and 9 unused-index notices.
- Migration `20260718062617_optimize_rls_policies.sql` removes the 10 redundant service-role allow policies, preserves explicit deny-all policies on the two tables that would otherwise become policyless, scopes public reads to `anon, authenticated`, scopes ownership/admin access to `authenticated`, wraps all 28 remaining `auth.uid()` checks in init-plan subqueries, and makes all UPDATE checks explicit.
- The migration also sets `admin_content_workbench_readiness` to `security_invoker`. The existing `anon` and `authenticated` SELECT revocations remain unchanged, while `service_role` retains access through its table grants and RLS bypass behavior.
- All 82 migrations replay successfully from empty locally. The final catalog has 40 policies, no `PUBLIC` or service-role policy, no policy-level `auth.role()`, no unoptimized `auth.uid()` call, no incomplete UPDATE policy, and no public table without RLS.
- The transactional role matrix passes for anonymous, authenticated owner, authenticated non-owner, admin, and service-role behavior, including ownership-reassignment denial and service-role access after removal of allow-all policies. The transaction rolls back all fixtures.
- Local security advisors report no finding. The 32 Auth RLS init-plan and 27 multiple-permissive-policy findings are absent; the remaining local performance findings are the 7 DB-104 foreign-key findings and data-less unused-index notices.
- Ten existing database/security SQL suites, 858 application tests, typecheck, lint, migration-version validation, and database lint pass. Database lint still reports only the pre-existing notification enum/text error.
- A short-lived $0 Supabase project in `ap-south-1` replayed all 82 migrations in order on PostgreSQL 17.6. Migration parity was exact, the final dry-run reported `Remote database is up to date`, and the project remained `ACTIVE_HEALTHY` throughout verification.
- The hosted transactional role matrix passed for anonymous, authenticated owner, authenticated non-owner, admin, and service-role behavior. All five existing security suites and all four existing database regression suites also passed sequentially against the hosted schema.
- Hosted security advisors reported only the six intentional public email/token RPC warnings tracked by DB-106. Hosted performance advisors contained no Auth RLS init-plan or multiple-permissive-policy finding; the remaining findings were the seven DB-104 foreign-key findings and unused-index notices expected on a new database without traffic.
- Hosted database lint reported only the pre-existing, unrelated enum/text error in `queue_content_request_published_notifications`. DB-103 introduced no new lint issue.
- The disposable project was deleted after verification, returning the organization to its production-only state. Production was not changed during local or hosted verification.
- Immediately before production deployment, schema, role, migration-history, policy, view, and data-invariant snapshots were written to `/Users/j/.codex/backups/Lifebook/db103-production-20260718T075221Z` with verified SHA-256 checksums. The production dry-run proposed exactly `20260718062617_optimize_rls_policies.sql`.
- The reviewed migration applied successfully. Production now has 82 matching local/remote migration versions, and the post-deployment dry-run reports `Remote database is up to date`.
- Production has 40 intentional public-schema policies across 20 RLS-enabled public tables, with no policyless RLS table, `PUBLIC`-target policy, service-role policy, policy-level `auth.role()` call, unoptimized `auth.uid()` call, or incomplete UPDATE policy. `admin_content_workbench_readiness` is now `security_invoker=true` while remaining inaccessible to `anon` and `authenticated`.
- The production transactional role matrix passed for anonymous, authenticated owner, authenticated non-owner, admin, and service-role behavior and left zero fixtures. All five existing security suites and all four existing database regression suites also passed.
- Content, segment, highlight, library, and Gemini-embedding counts and identifier fingerprints were identical before and after deployment: 524 content items, 5,371 segments, 79 highlights, 238 library rows, and 4,088 Gemini embeddings.
- Production performance advisors fell from 75 findings to the expected 16: 7 DB-104 unindexed-foreign-key findings and 9 unused-index notices. The 32 Auth RLS initialization-plan and 27 multiple-permissive-policy findings are gone. Security advisors remain at the documented 7 DB-106/DB-107 warnings.
- Database lint still reports only the pre-existing notification enum/text error. Since migration completion, sampled Postgres logs contain no `ERROR`, `FATAL`, or `PANIC`, sampled API logs contain no HTTP 5xx, the project remains `ACTIVE_HEALTHY`, and the homepage, Browse, Ask, health endpoint, and canonical redirect all return HTTP 200.

Historical migration text contains additional `auth.role()` policies, including permissive homepage administration in `004_homepage_section.sql`. Those homepage policies were replaced by `20260210_fix_admin_sections_rls.sql`, and live insert, update, and delete policies currently require `profiles.role = 'admin'`. They are migration-history context, not a current homepage authorization vulnerability.

#### Required outcome

Policies remain least-privilege, understandable, and efficient as tables grow.

#### Acceptance criteria

- [x] Ownership policies use `(select auth.uid())` where appropriate.
- [x] Policies use explicit `TO anon`, `TO authenticated`, or other intended roles.
- [x] Deprecated `auth.role()` policy checks are removed.
- [x] UPDATE policies contain explicit `USING` and `WITH CHECK` clauses.
- [x] Redundant service-role policies are removed where bypass behavior already supplies the required access.
- [x] Anonymous, authenticated-owner, authenticated-non-owner, admin, and service-role tests pass locally and in a disposable hosted project.
- [x] Advisor warnings are reduced to an approved, documented set.

### DB-104: Add missing foreign-key indexes

Status: Verified — production migration and post-deployment verification completed on 2026-07-20

The current advisor identifies missing covering indexes for:

- `content_reader_daily.user_id`
- `content_request_notifications.user_id`
- `content_requests.published_content_id`
- `content_requests.submitted_by`
- `segment_embedding_gemini.content_item_id`
- `user_highlights.content_item_id`
- `user_highlights.segment_id`

#### Audit and local verification — 2026-07-19

- All seven relationships exist in production with the expected `CASCADE` or `SET NULL` action.
- No existing index has the foreign-key column as its leading key. PostgreSQL can currently scan three non-leading composite keys, but that requires scanning across the leading-key space and is not dependable coverage as those tables grow.
- `segment_embedding_gemini.content_item_id` is the highest-value correction: the table has 4,088 rows, retained statistics contain approximately 3,805 matching calls, and the current equality plan is a sequential scan.
- `user_highlights.segment_id`, `content_requests.published_content_id`, and `content_requests.submitted_by` also plan as sequential scans. The remaining tables are empty today, so their current plan cost does not represent future cascade and join cost.
- Migration `20260719151322_add_missing_foreign_key_indexes.sql` adds seven leading B-tree indexes. Three use `INCLUDE` columns to cover observed reads without adding unnecessary search keys. No existing index is replaced or removed.
- Ordinary transactional index creation is appropriate for the current production sizes. A five-second lock timeout makes the migration fail closed under unexpected contention; the migration does not use `CREATE INDEX CONCURRENTLY`, which cannot run inside the normal transactional migration path.
- All 83 migrations replayed successfully from empty in the isolated local database. All seven catalog contracts and forced index-eligibility plans passed, the unindexed-foreign-key advisor returned no finding, security advisors returned no finding, and database lint retained only the pre-existing notification enum/text error.

#### Disposable hosted verification — 2026-07-20

- A short-lived $0 Supabase project in the production region replayed all 83 repository migrations in exact filename order on PostgreSQL 17.6.
- The DB-104 catalog contract and all seven forced index-eligibility plans passed. Ten existing database/security suites also passed, for 11 hosted SQL suites in total.
- All seven new indexes were present, valid, ready, non-partial, and usable as leading-key foreign-key coverage. The hosted performance advisor reported no unindexed foreign key; its only DB-104-related notices were expected unused-index notices on an empty database.
- Generated hosted and production schemas matched after normalizing only the PostgREST generator-version metadata. The 14-category schema fingerprint matched in 13 categories; the sole difference was exactly the seven intended index definitions.
- Hosted security advisors introduced no new warning. They reported only the six intentional public email/token RPC warnings tracked by DB-106.
- No test fixtures remained. Every non-seeded public table, `auth.users`, and `storage.objects` was empty; the only rows were the migration-owned `Matthew` series and the `Diary of a CEO` and `TED Talks` homepage sections.
- The sampled PostgreSQL log contained no unexplained error. The only error was the deliberate cleanup assertion used to identify those migration-seeded rows.
- The disposable project was deleted after verification, and the project inventory again contained only the healthy production project. Production was not modified.

#### Production release — 2026-07-20

- Green PR #30 was squash-merged as `47a2cb4` before deployment.
- A fresh private logical backup captured roles, schema, and 51,139,472 bytes of data. All three SHA-256 checks passed, and the backup directory and files are owner-only.
- The final production dry-run proposed exactly `20260719151322_add_missing_foreign_key_indexes.sql`, whose SHA-256 was `4dd3ca273fe9a7acdd558eefa6a64ff755a6826c861e059c90c2e2cecef06090`.
- Preflight confirmed all seven expected foreign keys, no pre-existing DB-104 index, and no transaction older than 60 seconds. The reviewed migration then completed within its five-second lock timeout.
- Production reached 83/83 migration parity with a clean dry-run. All seven indexes are valid, ready, non-partial, and match the reviewed key and include-column contracts; all seven forced index-eligibility plans passed.
- Counts on every affected table were unchanged across deployment: 0 `content_reader_daily`, 0 `content_request_notifications`, 4 `content_requests`, 4,088 `segment_embedding_gemini`, and 80 `user_highlights` rows.
- Performance advisors now contain no unindexed-foreign-key finding. The 16 remaining notices are unused-index notices, including the seven newly created indexes before they have accumulated production scans. Security advisors remain at the seven documented DB-106/DB-107 warnings.
- Database lint retained only the pre-existing `queue_content_request_published_notifications` enum/text issue. Post-deployment logs contained no PostgreSQL error or API 5xx, five public application probes returned HTTP 200 or the expected login redirect, and the Supabase project remained `ACTIVE_HEALTHY`.

#### Acceptance criteria

- [x] Each targeted foreign key has a useful covering index in the reviewed migration.
- [x] Duplicate or redundant indexes are avoided.
- [x] Delete, cascade, join, and common filter plans are inspected.
- [x] The unindexed-foreign-key advisor reports no unaccepted findings.

### DB-105: Add core database constraints and invariants

Status: Verified

#### Read-only production audit — 2026-07-20

- Audited 524 `content_item` rows, 5,371 `segment` rows, and the current `content_series` row before writing the migration. No row violates any of the selected first-tranche rules.
- Titles are nonblank and at most 82 characters; all non-null durations are positive; category values are nonblank, trimmed, and at most 120 characters; series identifiers and orders are consistently paired; and all verified items have `published_at`.
- Segment timing values contain no partial, negative, zero-length, or reversed pair. Zero-based ordering is intentional: 520 segments currently use `order_index = 0`.
- All current `quick_mode_json` values satisfy the core object shape. Existing extension keys are legitimate, and the retained `insert_generated_content` service RPC defaults this field to `{}` and uses zero-based segment ordering. Available statement statistics recorded 1,065 calls across its current PostgREST query shapes, so these compatibility contracts must not be removed casually.

#### Selected first tranche

The database migration owns enforcement for all direct SQL and service-role writes. The admin content APIs own matching early validation and user-facing errors.

| Table | Business rule |
| --- | --- |
| `content_item` | A title contains non-whitespace content and is no longer than 300 characters. Existing harmless surrounding whitespace remains compatible; API writes trim it. |
| `content_item` | A supplied duration is greater than zero. |
| `content_item` | A supplied category is trimmed, nonblank, and no longer than 120 characters. |
| `content_item` | `quick_mode_json` is null, `{}`, or an object with string `hook` and `big_idea` values plus a string-array `key_takeaways`; additional keys remain supported. |
| `content_item` | `series_id` and `series_order` are both null or both present, and a present order is positive. |
| `content_item` | Verified content has an immutable publication timestamp. |
| `segment` | Start and end times are both null or both present; a present start is nonnegative and the end is greater than the start. |
| `content_series` | Titles are nonblank and at most 120 characters; slugs are lowercase URL-safe identifiers; descriptions are at most 500 characters. |

The migration adds ten named checks with a five-second lock timeout. It adds each check as `NOT VALID`, validates it separately, and fails closed if either the catalog or the audited data differs from expectations.

#### Deliberately deferred rules

- A database `segment.order_index >= 0` check is deferred. The current atomic reorder function temporarily stages rows at negative indexes to avoid uniqueness collisions. The API now rejects incoming negative indexes, but the function must be redesigned before the database can enforce this rule without breaking working edits.
- A strict category allowlist is deferred until the active generator and editorial contracts have a single versioned taxonomy. The first tranche enforces only safe category shape.
- Exact `quick_mode_json` keys are not enforced because existing extension keys and the service RPC's `{}` draft default are supported contracts. The first tranche validates the required core shape when populated.
- Cross-table timing-versus-duration checks, nonblank draft segment bodies, stricter lifecycle transitions, and new uniqueness rules remain design items because current product semantics do not establish them as universally valid invariants.

#### Acceptance criteria

- [x] Each implemented invariant has a documented business rule and enforcement owner.
- [x] Existing production data is audited before adding a validated constraint.
- [x] Constraints use a bounded-lock rollout appropriate to the current table sizes and traffic.
- [x] Eligible checks use `NOT VALID` followed by `VALIDATE CONSTRAINT`; unsupported low-lock assumptions are not applied to other constraint types.
- [x] API validation and database constraints agree for the implemented write paths.
- [x] Invalid direct SQL and service-role writes fail safely in the local regression suite.
- [x] The migration and regression suite pass in a disposable hosted project before production consideration.
- [x] A post-merge production dry-run lists exactly the reviewed DB-105 migration, followed by a fresh backup and explicit rollout authorization.

#### Production deployment — 2026-07-22

- Green PR #32 was squash-merged as `e194558`, and its post-merge CI and Security Gates passed.
- The final production dry-run listed only `20260720145630_enforce_core_content_invariants.sql`; its SHA-256 matched the hosted-tested migration.
- A fresh owner-only logical backup was captured and hash-verified immediately before deployment.
- The preflight found zero violations across all ten rules. The migration completed within its bounded lock and statement timeouts.
- Production reached 84 migrations with all ten DB-105 checks validated and none left unvalidated. The post-deployment dry-run is clean.
- Counts and invariant fingerprints for 524 content items, 5,371 segments, and one series were identical before and after deployment; all ten post-deployment violation counts remain zero.
- Advisors introduced no finding and still report only the seven accepted DB-106/DB-107 warnings. Lint still reports only the pre-existing notification enum/text issue. The home page, health endpoint, and browse page returned HTTP 200.

### DB-106: Review public email/token RPC risk acceptance

Status: Verified on 2026-07-22

Review due: 2026-07-31. Completed before the deadline; the temporary allowlist was removed rather than renewed.

#### Current state

The three `SECURITY DEFINER` email/token functions are executable only by `service_role`. Their application routes validate input, use the production Upstash-backed rate limiter with analytics enabled, and record malformed-token and rate-limit security telemetry. Direct Data API callers can no longer bypass those controls.

The read-only production review on 2026-07-22 confirmed fixed `search_path` values, exact signatures, no public table grants, two email-subscription rows, zero notification-preference rows, 64-character hexadecimal tokens with no duplicates or malformed values, and no matching RPC entry in the available 24-hour API or Postgres log window. Each function returns `void`, so a syntactically valid missing token and a matching token have the same external result shape.

The approved design keeps the browser-facing application routes unchanged while routing their three fixed calls through a narrow server-only wrapper backed by the existing service-role client. Migration `20260722124111_restrict_public_email_rpcs.sql` revokes direct execution from `PUBLIC`, `anon`, and `authenticated` and retains only `service_role`. CAPTCHA is not required at the current two-subscriber, no-observed-abuse stage after the direct bypass is removed; reconsider it if rate-limit or invalid-token telemetry indicates abuse.

#### Acceptance criteria

- [x] The allowlist review is completed before its review date.
- [x] Function grants remain limited to the intended roles.
- [x] Functions disclose no subscription or notification data.
- [x] High-entropy token behavior is tested.
- [x] Abuse monitoring is confirmed in production.
- [x] CAPTCHA is added or explicitly deemed unnecessary based on observed abuse and rate-limit behavior.

#### Pre-production verification — 2026-07-22

- All 85 migrations replayed from empty locally, including the ACL-only DB-106 migration.
- The recurring function-ACL check passes with no public `SECURITY DEFINER` exception.
- The DB-106 role and behavior proof confirms no `anon` or `authenticated` execution, explicit `service_role` execution, fixed search paths, 32-byte random-token defaults, valid unsubscribe behavior, and generic no-match behavior. Its synthetic row is deleted in the same statement.
- Focused API and security tests, the post-rebase 877-test unit suite, the 158-test security suite, repository lint, typecheck, and production build pass.
- A Supabase-quoted `$0/month` disposable project in the production region replayed all 85 repository migrations. All 12 recurring database/security checks passed there, the DB-106 ACL state matched the intended roles, no synthetic row remained, and the hosted security advisor returned zero findings. The project was deleted immediately after the evidence was captured.
- Definition-level comparison with production matched constraints, indexes, policies, functions, triggers, RLS state, and Storage bucket configuration. Public columns and definitions also matched; only the non-semantic physical order of existing `profiles.is_internal` and `profiles.onboarding_state` columns differed because they entered the historical environments in different order.
- PR #38 passed `validate`, `Security Validation`, and Vercel checks, merged as `140e8a1`, and deployed successfully before the database permission change.

#### Production rollout verification — 2026-07-22

- The final production dry-run proposed exactly `20260722124111_restrict_public_email_rpcs.sql`; it was applied only after explicit authorization. The post-deployment dry-run reports the remote database is up to date and migration history contains exactly one `20260722124111` row.
- All three functions remain `SECURITY DEFINER` with fixed `search_path=public`; `anon` and `authenticated` have no execute privilege, while `service_role` retains execute privilege. A direct anonymous Data API call now returns HTTP 401.
- The deployed application health endpoint and both well-formed no-match unsubscribe routes return HTTP 200 through the server-controlled wrapper. Subscriber counts remained unchanged at two email subscriptions and zero notification-preference rows.
- The six DB-106 security-advisor warnings are gone. The only remaining security-advisor warning is leaked-password protection, tracked by DB-107.
- The production routes retain Upstash sliding-window analytics and Sentry-backed security telemetry. CAPTCHA remains unnecessary at the current traffic and abuse level, subject to review if telemetry changes.

### DB-107: Configure production Auth, database, and network controls

Status: In progress

#### Current verified state (2026-07-25)

- Production Auth no longer automatically confirms direct email sign-ups. `mailer_autoconfirm` was changed from `true` to `false` through the Management API and verified through the public Auth settings endpoint. Existing users, Google sign-in, email magic-link sign-in, and admin password sign-in remain enabled; the application health endpoint returned HTTP 200 after the Auth reload.
- Email ownership confirmation is therefore required for any direct email sign-up that bypasses the application's `shouldCreateUser: false` magic-link flow. No Auth user was created or modified by the configuration change; production remains at nine confirmed users and zero unconfirmed users.
- Email OTP expiry is 3,600 seconds and OTP length is eight digits. Redirects are restricted to the production Netflux origins plus the intentional localhost development callbacks. Secure email change and refresh-token rotation are enabled.
- Password minimum length remains six and no character-class requirement is configured. Do not strengthen this blindly: Supabase can reject sign-in for an existing weak password, and the production admin uses password authentication. Verify or rotate the admin credential before changing the policy.
- Leaked-password protection remains unavailable on the Free plan. This is the only current Supabase security-advisor warning and is accepted until a paid plan is justified.
- Custom SMTP and Auth security-notification emails remain disabled. The application already uses a separate server-side email provider, but Supabase Auth SMTP credentials and delivery behavior must be tested before enabling Auth email delivery for users.
- User-level TOTP is available, but dashboard-account MFA enrollment and recovery-code custody require an interactive owner action. Organization-wide MFA enforcement is paid-only.
- SSL enforcement is currently disabled. Database network restrictions are technically applied as `0.0.0.0/0` and `::/0`, which is effectively unrestricted. The Vercel application uses Supabase's HTTPS APIs and is unaffected by database-IP restrictions, but operator and GitHub production-verification SQL connections must be mapped before tightening the database allowlist.
- The application does not use a runtime direct Postgres connection. Hosted disposable verification intentionally uses the IPv4-compatible session pooler; serverless transaction pooling is not currently part of the application runtime.
- All 20 public tables have RLS enabled and at least one policy. The live security advisor reports no exposed-table or function warning. The required security workflow now inventories the reviewed browser-accessible table and function surface and fails closed when a new public table lacks RLS or a policy, a new table/function receives unreviewed browser access, a public view is not `security_invoker`, a public materialized view appears, or a browser role can use a public sequence. Its transactional negative proof creates unsafe fixtures, confirms every relevant class is rejected, and removes the fixtures in the same statement.
- [`OPS.md`](./OPS.md) now defines routine zero-downtime and emergency-compromise procedures for the elevated Supabase API key, Management API token, database credential, public API key, and separate Auth signing-key lifecycle. The current server constructor can accept a named `sb_secret_...` value without renaming `SUPABASE_SERVICE_KEY`. The 2026-07-26 name/scope inventory established the pre-rollout baseline: Vercel exposed this variable to Production, Preview, and Development, while the GitHub production-verification secret names were not configured. The Vercel scope correction is recorded below; deliberate provisioning of any future GitHub production-verification runner remains separate work.
- On 2026-07-27, a dedicated named Supabase secret key, `vercel_production_20260727`, replaced the legacy JWT value in Vercel Production without changing the application environment-variable name. The reviewed main commit `0947254` was rebuilt as production deployment `dpl_DXv2HThaTF4rmftnKGeGd4zTja2q`; it reached `READY`, received all public aliases, returned HTTP 200 from shallow and detailed health, reported the database reachable with `supabase_admin` ready and no issues, and returned the normal generic HTTP 200 from a syntactically valid no-match privileged unsubscribe RPC.
- Vercel Preview and Development no longer define `SUPABASE_SERVICE_KEY`, so future non-production deployments cannot inherit production RLS-bypass access. The legacy Supabase `service_role` key remains enabled only as rollback protection while approved local/operator copies, older immutable deployments, and Dashboard-only consumers are audited; it was not disabled or exposed during this rollout.

#### Deferred controls and safety gates

- Do not enable SSL enforcement without verifying every operational connection string and scheduling the short database restart documented by Supabase.
- Do not enable restrictive database CIDRs until the production-verification runner and operator recovery paths have stable, tested source addresses.
- Do not enable CAPTCHA until the browser Auth flow passes the provider token; enabling only the server setting would break sign-in and sign-up requests.
- Do not enable password reauthentication requirements until the application implements and tests the corresponding nonce/current-password flow.
- Do not enable paid leaked-password protection or organization-wide MFA enforcement while the project remains intentionally on the Free plan.

#### Acceptance criteria

- [ ] Leaked-password protection is enabled after moving to a supported plan.
- [ ] Minimum password length and complexity meet the approved policy.
- [ ] Email confirmation, OTP expiry, redirect URLs, and custom SMTP are verified.
- [ ] Supabase organization MFA and recovery ownership are configured.
- [ ] SSL enforcement and database network restrictions are verified.
- [ ] Direct connections and pooler connections are used intentionally.
- [x] Secrets and service-role keys have documented rotation procedures.
- [x] Vercel Production uses a dedicated named Supabase secret key, while Preview and Development omit the production elevated credential.
- [x] Data API exposure and explicit table/function grants are verified after every new object migration.

## P2 — Cleanup and longer-term evolution

### DB-201: Repair minor data inconsistencies

Status: Not started

Current snapshot:

- one Auth user has no profile;
- two active verified content items lack item-level embeddings;
- eight Gemini segment embeddings belong to soft-deleted content;
- three reading-activity rows have `updated_at` earlier than `created_at`.

#### Acceptance criteria

- [ ] Each inconsistency has a diagnosed cause before repair.
- [ ] Repair SQL is idempotent and reviewed.
- [ ] Preventive constraints, triggers, or application fixes are added where appropriate.
- [ ] Post-repair audit returns zero unexplained inconsistencies.

### DB-202: Decide long-term content revision and taxonomy models

Status: Not started

Decisions to record:

- in-place segment editing versus immutable content revisions;
- rollback and audit-history requirements;
- one versus multiple authors;
- one versus multiple categories;
- one versus multiple source documents;
- controlled-text category versus lookup/junction tables;
- publishing lifecycle beyond `draft` and `verified`;
- JSON payload versioning and backward compatibility.

These are not reasons to redesign the current schema immediately. Each change should be driven by a concrete product requirement and include a migration path.

### DB-203: Add capacity, query, and recovery monitoring

Status: In progress — the fail-closed scheduled monitor and documented thresholds are implemented; credential activation, alert-delivery proof, current capacity remediation, and launch-load testing remain

#### Read-only baseline and implementation — 2026-07-29

- Production remains `ACTIVE_HEALTHY` on PostgreSQL 17.6. The database is 64,490,643 bytes against the configured 500 MB Free-plan database quota, with 15 of 60 connections used, one active connection, zero lock waiters, zero transactions older than five minutes, and zero recurring query fingerprints averaging at least one second across 20 or more calls.
- Storage contains 1,013 objects totaling 1,222,139,218 bytes. This exceeds the configured 1 GB Free-plan threshold and is intentionally a blocking monitoring result rather than an allowlisted success.
- Request-notification processing has no queued, processing, or failed row. The existing GitHub worker is therefore healthy at the database boundary.
- Narration has one job queued since 2026-07-22 and no failure in the last 24 hours. Narration is not currently scheduled; the monitor emits a warning requiring manual review. If a recurring narration worker is enabled, `DB203_NARRATION_WORKER_ENABLED=true` converts any stale or recently failed narration work into a blocking result.
- [`check-supabase-production-health.mjs`](../scripts/check-supabase-production-health.mjs) uses only the Supabase Management API's read-only database-query endpoint, the current ClickHouse-backed unified logs endpoint, project health, and backup inventory. It does not return query text, log messages, user content, object names, credentials, or other sensitive payloads.
- The daily/manual `Supabase Production Monitoring` GitHub job fails closed when its credential or recovery timestamps are missing. It checks database and Storage capacity, connection saturation, lock waits, long transactions, aggregate slow-query fingerprints, worker queues and recent failures, API 5xx/database error aggregates, hosted backup/PITR state, independent recovery-point freshness, and restore-drill freshness. It also runs both Supabase security and performance advisors.
- The monitor follows the 2026-07-23 Supabase logs API migration and uses `/analytics/endpoints/logs` with ClickHouse SQL; it does not depend on the retiring `logs.all` endpoint.

#### Thresholds and operating policy

| Signal | Warning | Blocking |
| --- | --- | --- |
| Database or Storage capacity | 80% of configured quota | 100% of configured quota |
| Connections | 80% of `max_connections` | 90% of `max_connections` |
| Locks / long transactions | — | any lock waiter or transaction older than five minutes |
| Recurring slow queries | 1–5 fingerprints with 20+ calls and mean execution time of at least one second | more than 5 fingerprints |
| Supabase API/database logs | aggregate observation | more than 5 API 5xx or database errors in 24 hours; any `FATAL`/`PANIC` |
| Request notifications | — | any row queued/processing over 15 minutes or failed in 24 hours |
| Narration | stale work when no scheduler exists | stale/recently failed work when a scheduler is enabled |
| Independent database/Storage recovery point | — | older than 24 hours or timestamp missing/invalid |
| Restore drill | — | older than 90 days or timestamp missing/invalid |
| Hosted backup/PITR | warning while the documented Free-plan risk acceptance remains | blocking after `DB203_REQUIRE_HOSTED_BACKUP=true` at launch |

Thresholds are configurable through documented `DB203_*` environment values, but they must not be raised merely to make a failing run green. Update a threshold only after recording the capacity, traffic, or operating-model evidence that justifies it.

#### Remaining activation and launch proof

- Provision a least-privilege Supabase Management API token for GitHub with project/database read, advisor read, analytics-log read, and backup-inventory read access. Do not place the current broad operator token or a database/service-role credential in the scheduled job.
- `SUPABASE_PROJECT_REF` and the three verified recovery timestamps were configured in GitHub on 2026-07-29. Provision and configure only the remaining dedicated `SUPABASE_ACCESS_TOKEN`; do not reuse the broad operator credential.
- Run the workflow manually, confirm that the current Storage and recovery-point breaches produce a failed job, and verify the repository owner receives the GitHub Actions failure notification.
- Refresh both independent recovery points, update their timestamps, and rerun. Storage must be reduced below the approved threshold or the plan decision revisited before the monitor can pass.
- Run and record representative launch traffic in the established disposable hosted environment before changing DB-203 to Verified.

#### Acceptance criteria

- [ ] Alerts exist for database and Storage capacity thresholds. The checks are implemented; activate the credential and prove notification delivery.
- [ ] Connection saturation, slow queries, lock waits, failed jobs, and API/database error rates are monitored. The checks are implemented; prove the first scheduled run.
- [ ] Narration processing and request-notification worker freshness, failure, retry, and backlog signals are monitored wherever those workers are scheduled. Database signals are implemented; clear or deliberately cancel the stale narration job and prove the enabled request-notification worker run.
- [x] Do not introduce `pg_cron` or Supabase Edge Functions solely for monitoring; the implementation follows the existing GitHub Actions worker runtime.
- [ ] `pg_stat_statements` or equivalent query diagnostics are reviewed regularly. The aggregate check is implemented; prove the first scheduled run and record the review owner.
- [ ] Advisor audits run on a schedule and after database changes. The daily/manual workflow and production-release checks exist; activate the scheduled credential and prove a run.
- [ ] Backup freshness and independent Storage-copy freshness are monitored. Fail-closed timestamps are implemented; activate them and connect updates to the backup procedure.
- [x] Restore drills run on a documented 90-day cadence, with the last successful drill recorded on 2026-07-15.
- [ ] Expected launch traffic is tested in staging with documented results.

## Decision log

Record decisions that materially affect database behavior or the order of work.

| Date       | Decision                                                                                                     | Reason                                                                                                                                            | Owner            | Revisit date                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------- |
| 2026-07-14 | Treat migration reconciliation, highlight preservation, and recoverability as the first production blockers. | These issues affect reproducibility and irreversible user-data loss.                                                                              | Unassigned       | Before implementation                          |
| 2026-07-15 | Use an isolated disposable hosted project for DB-004 while production remains on the Supabase Free plan.     | Preview branches require a paid plan; a separate project provides a real hosted replay without production data or production-first mutation.      | Repository owner | Revisit after plan upgrade                     |
| 2026-07-15 | Adopt a 24-hour launch RPO, one-hour post-upgrade database RPO target, and four-hour service RTO.            | These targets are achievable for the current data volume while still rejecting manual-only backups and disabled PITR as a launch posture.         | Repository owner | After the first restore drill on the paid plan |
| 2026-07-15 | Gate production through required GitHub checks and Vercel checks that block production alias assignment.     | Vercel currently begins and aliases a `main` deployment before GitHub validation completes; both source control and traffic promotion need gates. | Repository owner | After the first bypass test                    |
| 2026-07-17 | Keep cosine similarity as the Gemini retrieval contract and preserve exact completion-boosted reranking. | Production embeddings are not unit-normalized, while the application threshold and returned similarity already use cosine. A separate exact boosted branch avoids an unmeasured relevance change from truncated ANN candidates. | Repository owner | After embedding model or retrieval-contract changes |

## Work log

| Date       | ID                                    | Update                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Evidence                                                                                                                                                                                                                  |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-14 | All                                   | Created the initial production-readiness tracker from a read-only repository and live Supabase assessment. No schema, data, policy, migration, or Storage changes were made.                                                                                                                                                                                                                                                                                                                                                                                                                        | This document                                                                                                                                                                                                             |
| 2026-07-14 | DB-001, DB-002, DB-101–DB-106, DB-203 | Clarified legacy migration versions, live-versus-historical state, embedding preservation, vector latency evidence, constraint rollout patterns, the public-RPC review deadline, and actual background-worker monitoring scope.                                                                                                                                                                                                                                                                                                                                                                     | Read-only repository and live Supabase verification                                                                                                                                                                       |
| 2026-07-14 | All                                   | Replaced the simple backlog order with a dependency-based execution model covering immediate safeguards, the critical path, parallel launch gates, and post-stabilization work.                                                                                                                                                                                                                                                                                                                                                                                                                     | This document                                                                                                                                                                                                             |
| 2026-07-14 | DB-001                                | Started read-only reconciliation discovery. Verified normalized recorded-SQL matches for all 28 same-version pairs, mapped 8 differently versioned SQL-equivalent pairs, isolated the non-equivalent highlights pair, confirmed both duplicate-version changes have live effects, and added explicit production no-go gates. No schema, data, policy, Storage, function, or migration-history changes were made.                                                                                                                                                                                    | `supabase migration list --linked`, read-only `supabase_migrations` and catalog queries, repository migration files                                                                                                       |
| 2026-07-14 | DB-001                                | Reconciled production migration history after database and independent Storage backups. Production is now at 75/75 version and recorded-SQL parity; dry-run reports no pending changes; a fresh local replay matches production across 13 schema categories and passes all five database-security suites. The approved production operation changed only migration-history metadata. CI guards were added; disposable hosted replay remains.                                                                                                                                                        | Pre-repair backup, `supabase migration repair`, dry-run, schema fingerprint, security checks, and `.github/workflows/security.yml`                                                                                        |
| 2026-07-15 | DB-001, DB-004                        | Replayed all 76 migrations from empty in a disposable hosted project, expanded fingerprinting to enums, reconciled the missing historical `video` label and extension search-path assumptions, matched production across 14 categories, matched fresh generated types, passed five SQL security suites and 7/7 application smoke tests, refreshed 11 production history rows metadata-only, and applied the one idempotent reconciliation migration. Production is now 76/76 and DB-001 is Verified. DB-004 remains In progress only because deployment enforcement is not yet proven unbypassable. | Hosted reset, schema fingerprint, generated-type comparison, advisors, production build, Playwright smoke, private history backup, migration repair, production push, and clean dry-run                                   |
| 2026-07-15 | DB-002                                | Completed pre-production implementation and proof for in-place, highlight-safe segment reconciliation with a fail-closed highlighted-removal rule and HTTP 409 admin feedback. Replayed all 77 migrations locally and in a disposable hosted project; passed transactional database regression checks, five SQL security suites, typecheck, lint, 137 focused security/API tests, the full 851-test suite, advisor review, production build, and 7/7 hosted smoke checks. At this checkpoint, production was unchanged and its dry-run proposed only the reviewed DB-002 migration.                 | `20260715052003_preserve_highlights_during_admin_graph_updates.sql`, `database-highlight-preservation-check.sql`, API regression test, local reset, hosted reset, advisors, schema/type comparison, and application smoke |
| 2026-07-15 | DB-002                                | Applied the single reviewed DB-002 migration after fresh roles/schema/data backups and explicit authorization. Production remained at 79 highlights linked across 43 segment UUIDs with zero orphans; migration parity, 14-category schema parity, function ACLs, five SQL security suites, advisors, and synthetic production-connected admin edit/rollback checks passed. DB-002 is Verified.                                                                                                                                                                                                     | Private backup manifest and checksums, clean production dry-run, schema fingerprint, ACL queries, advisors, HTTP 200/409 synthetic smoke, and zero-fixture cleanup audit                                                  |
| 2026-07-15 | DB-002                                | Deployed the isolated HTTP 409 application mapping in commit `7735c8f`. Preview and production deployments reached `READY`; public routes and health returned HTTP 200; Vercel reported no runtime errors; and the post-deployment database audit remained at 79/79 linked highlights across 43 segments with zero orphans. The IP allowlist remained enforced. The remaining user-path check requires a genuinely allowlisted, authenticated admin session.                                                                                                                                        | Vercel deployments `dpl_LYfgyPWJuy4GZoYkyDbm5rDHZLBD` and `dpl_J9cmZjV5cPYBiLDr5EthCkyJHk4d`, public browser smoke, runtime logs, clean migration dry-run, and live integrity query                                       |
| 2026-07-15 | DB-003                                | Defined launch and post-upgrade recovery targets, explicitly rejected the current manual-only/disabled-PITR posture for launch, documented Storage lifecycle rules, verified all 981 independent object hashes and exact byte parity, and completed an isolated local logical-backup restore. Recovered relational invariants passed; browse, read, unauthenticated denial, and synthetic-admin login smoke checks passed; the fixture and stack were deleted.                                                                                                                                      | Supabase backup status, bucket catalog, `storage.sha256`, logical-backup checksums, restored row-count audit, and 6/6 exercised application smoke checks                                                                  |
| 2026-07-15 | DB-003                                | Prepared a fail-closed, idempotent bucket-limit migration aligned with the existing upload APIs and expanded the recurring Storage security check to detect configuration or object drift. A read-only production audit found zero incompatible objects; all 78 migrations replayed locally and all six database/security suites passed. Production remains unchanged pending the DB-004 Vercel gate.                                                                                                                                                                                               | `20260715110000_enforce_storage_bucket_upload_limits.sql`, production MIME/size audit, local reset, idempotency replay, migration-version check, and six SQL suites                                                       |
| 2026-07-16 | DB-003, release gate                  | Verified the ordered 79-migration repository state, including `20260715070000_add_content_published_at.sql` followed by the bucket-limit migration, in a short-lived empty hosted project. Seven SQL security and behavior suites passed; generated types differed from production only by the four expected `published_at` declarations; the 14-category fingerprint differed only in the intended column, functions and ACL, index, trigger, and two bucket configurations; public table/RPC probes returned HTTP 200; advisors introduced no security regression. Synthetic rows were removed and the disposable project was deleted. Production remained unchanged. | Local empty replay and idempotency replay, hosted migration-name parity, schema inventory diff, generated-type diff, seven SQL suites, advisor comparison, three public REST/RPC probes, and confirmed disposable-project deletion |
| 2026-07-16 | DB-003, production release            | Applied the reviewed `published_at` and Storage bucket-limit migrations as one production batch after a fresh private roles/schema/data backup, pre-change content fingerprint, bucket configuration snapshot, zero-incompatible-object audit, exact dry-run, and explicit authorization. Production is now 79/79 with recorded-SQL parity and a clean dry-run; all 14 schema categories match local replay; 423 verified items were backfilled to their original creation times while 101 drafts remained unpublished and the verified-row `updated_at` fingerprint did not change. The bucket contracts are live, all 981 Storage objects and total bytes are unchanged, five security suites passed, anonymous RPC smoke passed, and seven public application routes returned HTTP 200. Advisors reported only the existing DB-103/DB-106/DB-107 findings, and lint reported only the pre-existing notification enum-cast error. | Private backup `~/.codex/backups/Lifebook/published-at-storage-production-20260716T094053Z`, migration parity and dry-run, 14-category schema fingerprint, content and Storage invariants, production security suites, advisors, lint, anonymous RPC smoke, and public HTTP smoke |
| 2026-07-17 | DB-003, recovery-point refresh        | Reconfirmed the organization remains on the Free plan with no retained physical backup and PITR disabled, measured the production database at 64,228,499 bytes, and created a fresh read-only logical database export plus complete independent Storage copy. All three database dump hashes and all 981 Storage hashes passed; Storage counts and 1,146,837,837 total bytes match production exactly. This restores a current manual recovery point but does not close the paid-plan, PITR, automated-retention, or alerting gates. | `supabase backups list`, read-only database/Storage inventory, private database backup `~/.codex/backups/Lifebook/db003-production-20260717T085243Z`, independent Storage backup `~/Backups/Netflux/2026-07-17-db003-recovery`, and SHA-256 manifests |
| 2026-07-25 | DB-003, recovery-point refresh        | Created a fresh read-only logical database export and complete independent Storage copy. All three database dump hashes and all 1,013 Storage hashes passed; production inventories before and after the copy matched the local 261-audio, 752-media, 1,222,139,218-byte backup exactly. The database measured 64,474,259 bytes. No production database row, schema object, migration record, bucket setting, or Storage object was changed. This restores a current manual recovery point but does not close the automated-retention, alerting, Free-plan availability, or launch-RPO gates. | Private database backup `~/.codex/backups/Lifebook/db003-production-20260725T042740Z`, independent Storage backup `~/Backups/Netflux/2026-07-25-db003-recovery`, pre/post live Storage inventories, and SHA-256 manifests |
| 2026-07-17 | DB-101                                | Confirmed cosine must remain the Gemini retrieval metric, authored the cosine HNSW swap and index-eligible normal query path, preserved exact completion-boosted reranking, and added a fail-closed local/disposable regression check to the required Security Validation workflow. An empty replay passed. On the isolated production recovery snapshot, 97 real query vectors across all five libraries achieved exact top-12 set and order agreement at `ef_search = 200`; 20 representative normal searches improved from approximately 420.5 ms to 66.9 ms total. Production remained read-only and unchanged. | Live catalog/norm/distribution audit, `20260717101501_align_gemini_cosine_index.sql`, `database-gemini-vector-index-check.sql`, empty local reset, restored-snapshot relevance comparison, function-scoped index statistics, and comparative `EXPLAIN (ANALYZE, BUFFERS)` |
| 2026-07-17 | DB-101, hosted verification           | Created a $0 short-lived project in the production region, replayed all 80 migration names in repository order, verified the cosine index and function settings on PostgreSQL 17.6/pgvector 0.8.2, passed eight database security and behavior suites, generated types, and confirmed no DB-101 fixtures remained. Advisors introduced no security finding and no unused Gemini HNSW warning. The disposable project was deleted and production remained unchanged. | Hosted migration-name parity, catalog verification, eight SQL suites, generated types, advisor comparison with production, fixture cleanup query, CLI deletion, and post-deletion project inventory |
| 2026-07-17 | DB-101, production release            | Squash-merged green PR #21, created and hash-verified a fresh private logical backup, confirmed an exact one-migration dry-run, and applied the cosine HNSW migration with explicit authorization. Production reached 80/80 and a clean dry-run. All 4,088 embedding rows and their fingerprint remained unchanged; 97 normal-query ordered results matched the pre-deployment fingerprint; 25 boosted queries matched exact reranking; the valid cosine index recorded 97 scans; five security suites and seven public-route checks passed; security advisors did not regress; the obsolete unused-index finding disappeared; and the project remained healthy. | PR #21 and merge `1f852a6`; backup `~/.codex/backups/Lifebook/db101-production-20260717T143148Z`; migration checksum `82956decf8d46b001dec9732a08abee51332680f11083e1607867e903777e6e8`; pre/post data and relevance fingerprints; index catalog/statistics; parity and dry-run; security suites; advisor comparison; lint; Postgres logs; HTTP smoke |
| 2026-07-18 | DB-103, production release            | Applied the single reviewed RLS optimization migration after green PR #28, a hash-verified private logical backup, exact one-migration dry-run, and explicit authorization. Production reached 82/82 with a clean dry-run. All 20 public tables retain RLS and at least one policy; 40 intentional policies remain with explicit role targets and UPDATE checks; role-matrix and regression suites passed; data fingerprints were unchanged; performance findings fell from 75 to the expected 16; and production remained healthy with no sampled post-migration database error or API 5xx. | PR #28 and merge `a659522`; backup `~/.codex/backups/Lifebook/db103-production-20260718T075221Z`; migration checksum `f38e0367084c8a005e959dba0ca07964ec1d17b5f24bafaebe3758c74a0a704d`; pre/post catalog and data fingerprints; parity and dry-run; role matrix; regression suites; advisors; lint; logs; HTTP smoke |
| 2026-07-19 | DB-104                                | Audited all seven production foreign-key findings, existing indexes, referential actions, retained query patterns, table sizes, and current plans. Authored a fail-closed seven-index migration and a required catalog/plan regression check. All 83 migrations replayed from empty locally; all seven plan checks passed; local advisors contain no unindexed-foreign-key or security finding; typecheck, lint, migration validation, 147 security-focused tests, and the complete 862-test suite pass. Production remains unchanged. | Read-only production catalogs, aggregate statistics and `EXPLAIN`; `20260719151322_add_missing_foreign_key_indexes.sql`; empty local replay; DB-104 SQL check; local advisors; focused and full test suites; typecheck; lint |
| 2026-07-20 | DB-104, hosted verification           | Replayed all 83 migrations in order in a $0 disposable hosted project. Eleven SQL suites passed; all seven DB-104 indexes were valid, ready, and plan-eligible; the unindexed-foreign-key advisor returned no finding; generated schema and 13 unchanged fingerprint categories matched production; the index fingerprint differed by exactly the seven intended definitions; and no new security warning or unexplained database error appeared. Cleanup left only three intentional migration-seeded rows. The project was deleted and production remained unchanged. | Hosted migration-name parity; DB-104 catalog and plan checks; ten existing SQL suites; generated-schema comparison; 14-category fingerprint; advisors; cleanup and PostgreSQL-log audits; CLI deletion and project inventory |
| 2026-07-20 | DB-104, production release            | Applied the single reviewed foreign-key-index migration after green PR #30, a hash-verified private logical backup, an exact dry-run, and explicit authorization. Production reached 83/83 with a clean dry-run. All seven indexes are valid, ready, and plan-eligible; affected-table counts were unchanged; the unindexed-foreign-key findings are gone; security advisors did not regress; the known lint issue remained unchanged; public application probes passed; and production remained healthy with no sampled database error or API 5xx. DB-104 is Verified. | PR #30 and merge `47a2cb4`; backup `~/.codex/backups/Lifebook/db104-production-20260720T044533Z`; migration checksum `4dd3ca273fe9a7acdd558eefa6a64ff755a6826c861e059c90c2e2cecef06090`; pre/post row counts; migration parity and dry-run; DB-104 catalog/plan check; advisors; lint; logs; HTTP smoke |
| 2026-07-20 | DB-105                                | Audited the current production content, segment, series, generated-content RPC, and caller contracts read-only. Authored ten fail-closed core checks plus matching admin API validation while preserving zero-based segment ordering, temporary negative reorder staging, `{}` quick-mode drafts, and legitimate JSON extension keys. All 84 migrations replayed from empty locally; direct SQL and service-role rejection checks, existing database suites, local advisors, typecheck, lint, migration validation, 154 security tests, and the complete 869-test suite passed. Production remains unchanged. | Read-only production data/catalog/statement audit; `20260720145630_enforce_core_content_invariants.sql`; `database-content-invariants-check.sql`; empty local replay; database suites; local advisors and lint; focused and full application tests |
| 2026-07-20 | DB-105, hosted verification           | Replayed all 84 migrations in order in a $0 disposable hosted project through the IPv4-compatible session pooler. Eleven database security and behavior suites passed, including direct SQL and `service_role` rejection of invalid DB-105 writes. All ten constraints were present and validated, and hosted generated types matched the exact local replay. The project was deleted and production remained unchanged. | Hosted migration count and replay; ten existing SQL suites plus `database-content-invariants-check.sql`; constraint catalog query; hosted/local generated-type comparison; CLI project deletion |
| 2026-07-22 | DB-105, production release            | Applied the single reviewed constraint migration after green PR #32, successful post-merge checks, a fresh hash-verified logical backup, an exact dry-run, a zero-violation preflight, and explicit authorization. Production reached 84/84 with all ten checks validated and a clean dry-run. Content, segment, and series counts and invariant fingerprints were unchanged; all violation counts remain zero; advisors and lint did not regress; and three public application probes returned HTTP 200. DB-105 is Verified. | PR #32 and merge `e194558`; backup `~/.codex/backups/Lifebook/db105-production-20260722T071552Z`; migration checksum `d3eda9943a70b96d7a10f32186b3de50417df69b8775b4d6e32c1b5973fa3866`; pre/post fingerprints; constraint catalog; parity and dry-run; advisors; lint; HTTP smoke |
| 2026-07-22 | DB-106, production release            | Reviewed and removed direct Data API execution of the three email/token `SECURITY DEFINER` RPCs. After green PR #38, a complete 85-migration disposable hosted replay, an exact production dry-run, and explicit authorization, production now grants execution only to `service_role`. The post-deployment dry-run is clean, direct anonymous RPC access returns HTTP 401, the server-controlled health and no-match unsubscribe paths return HTTP 200, subscriber counts are unchanged, and all six DB-106 advisor warnings are gone. DB-106 is Verified. | PR #38 and merge `140e8a1`; migration `20260722124111_restrict_public_email_rpcs.sql`; local and hosted 12-suite verification; production migration parity and ACL catalog; direct anonymous denial; application HTTP smoke; advisor audit |
| 2026-07-25 | DB-107, Auth configuration            | Completed the production Auth, connection, network, Data API, and application-compatibility audit. Disabled automatic confirmation for direct email sign-ups as a narrowly scoped, reversible Free-plan control. The public Auth settings now report confirmation required while Google and email providers remain enabled; the Auth service reloaded cleanly, application health returned HTTP 200, and all nine existing users remain confirmed. Password hardening, SMTP, dashboard MFA, SSL enforcement, and restrictive database CIDRs remain behind their documented compatibility or owner-action gates. | Management API and public Auth settings; Auth logs; production health probe; network-restriction and SSL-enforcement status; live RLS, grant, and security-advisor catalogs |
| 2026-07-26 | DB-107, new-object security gate      | Added a required fail-closed catalog check for the reviewed Data API surface. It rejects public tables without RLS or policies, unreviewed browser table/function access, unsafe public views, public materialized views, and browser-accessible sequences. A transactional negative proof confirms unsafe fixtures are detected and removes them before completion. The empty 85-migration replay, all recurring database suites, security tests, unit tests, lint, typecheck, dependency audit, and migration validation passed. Production remained unchanged. | `security-new-object-access-check.sql`; empty local replay; 14 database/security suites; 158 security tests; 877 unit tests; lint; typecheck; production dependency audit; migration-version validation |
| 2026-07-26 | DB-107, credential recovery runbook   | Documented a staged migration from legacy `service_role` to independently rotatable named secret keys, routine and emergency procedures, consumer inventory, validation, rollback, forensic review, and separate handling for public keys, Management API tokens, database credentials, and Auth signing keys. Read-only name/scope inspection found the elevated Vercel variable in all three deployment scopes and no matching GitHub repository/environment secrets; no value was read, created, replaced, disabled, or revoked. | Official Supabase API-key, migration, and signing-key guidance; Vercel environment-name/scope listing; GitHub repository/environment secret-name listing; repository consumer search; [`OPS.md`](./OPS.md) section 4.5 |
| 2026-07-27 | DB-107, production secret rollout     | Created the dedicated Supabase secret `vercel_production_20260727`, replaced the legacy JWT value in Vercel Production through a guarded no-log handoff, and rebuilt the already reviewed main commit `0947254`. Deployment `dpl_DXv2HThaTF4rmftnKGeGd4zTja2q` reached `READY` and received all public aliases. Shallow and detailed health, database connectivity, and a real no-match privileged RPC returned HTTP 200. Preview and Development no longer define `SUPABASE_SERVICE_KEY`. The legacy Supabase key remains enabled as rollback protection until approved local/operator and Dashboard-only consumers are audited. | Supabase key name/type inventory; Vercel environment-scope inventory; green commit check-runs; production deployment metadata and aliases; shallow/detailed health; no-match privileged-RPC probe |
| 2026-07-29 | DB-203                                | Audited production health and implemented a fail-closed, read-only scheduled monitor for capacity, connections, locks, long transactions, aggregate slow-query fingerprints, worker backlogs/failures, aggregate API/database errors, backup and recovery freshness, project health, and both advisor classes. Current database health is good, but Storage is above the Free quota, one unscheduled narration job is stale, and the 24-hour independent-recovery target is not current. The production project reference and existing verified recovery timestamps are configured in GitHub; activation still requires a least-privilege Management API token and proof that a failed run reaches the owner. No production schema, data, Auth, Storage, or configuration was changed. | Live read-only Supabase catalogs/advisors; current Management API and ClickHouse logs documentation; `check-supabase-production-health.mjs`; scheduled workflow and unit/static tests; GitHub secret/variable name and timestamp inventory |
| 2026-07-15 | DB-004                                | Audited enforcement after CI returned green. No GitHub ruleset exists, and Vercel assigned production for commit `f1ac98a` before `validate` completed. Recorded the exact required check contexts and the two-layer source-control/production-alias enforcement design. Dashboard mutation remains pending an authenticated management session.                                                                                                                                                                                                                                                    | GitHub check-runs and ruleset APIs; Vercel deployment `dpl_DvWR7arw13fWwLyosk1A268wWHyE` and deployment-check documentation                                                                                               |
| 2026-07-15 | DB-004                                | Created and verified active repository ruleset `18984223` for `main`: no bypass actors, pull requests required, strict `validate` and `Security Validation` GitHub Actions checks required, and deletion/force pushes blocked. Vercel production-alias enforcement and the combined failing-branch challenge remain.                                                                                                                                                                                                                                                                                | Authenticated ruleset creation, full ruleset readback, and active `main` branch-rules query                                                                                                                               |
| 2026-07-15 | DB-004                                | Added Vercel Deployment Checks for the exact GitHub contexts `validate` and `Security Validation`, both with Production behavior. Vercel confirmed they apply to the next production deployment, and a full settings-page reload preserved both checks. No deployment or production-database mutation was used for this configuration step. DB-004 remains In progress pending observation of the next normal promotion and a safe failing-PR challenge of the GitHub rule.                                                                                                                         | Authenticated Vercel settings mutation, success confirmation, and post-reload configuration readback                                                                                                                      |
| 2026-07-15 | DB-004                                | Completed the first normal two-layer gated release through PR #14. GitHub kept the PR blocked while required checks were pending or failing and allowed the merge only after both passed. Vercel built commit `b6f5f42` but withheld all production aliases through the initial failed `validate` run and its rerun; the aliases appeared only after the rerun succeeded. The live domains and health endpoint then returned HTTP 200 from the expected deployment. DB-004 is Verified.                                                                                                             | PR #14 check and merge timestamps; ruleset `18984223`; Vercel deployment `dpl_FC63uQEfQTb3q2rsVT3CwiSf6EaJ`; pre- and post-check alias observations; live HTTP smoke                                                      |

## Execution model

This work is not a purely sequential backlog. Follow the critical path for schema-changing work while completing operational and security launch gates in parallel.

### Phase 0: Immediate safeguards

Complete these safeguards before changing production schema or migration history:

- [x] Freeze dashboard/manual production DDL until DB-001 is verified; subsequent changes must use the reconciled migration workflow.
- [x] Avoid editorial saves that submit segment replacements until DB-002 is deployed. The database protection and HTTP 409 application mapping are now live; normal editorial saves may resume, subject to the documented conflict behavior for highlighted-segment removal.
- [x] Take and verify a logical database export.
- [x] Copy `audio` and `media` Storage objects to an independent location.
- [x] Record the export time, Storage copy time, operator, source, destination, and restore instructions.
- [ ] Begin the approved paid-plan upgrade and capacity review from DB-003.
- [x] Assign an owner for DB-106 and schedule its review before 2026-07-31. The review and rollout completed on 2026-07-22.

Phase 0 is a containment and recovery prerequisite. It does not by itself mark DB-002 or DB-003 fully complete; DB-106 subsequently completed its full verification workflow.

### Critical path

Schema-changing production work follows this order:

1. **DB-001 — Reconcile migration history.**
   - Establish the repository as the replayable schema source.
   - Do not deploy later database changes through direct, untracked SQL.
2. **DB-004 — Prove staging and the release workflow.**
   - Rebuild from migrations in a disposable environment.
   - Run role-based database and application smoke tests.
3. **DB-002 — Deploy highlight-safe update semantics.**
   - Design and tests may begin during DB-001.
   - Production deployment must use the verified DB-001/DB-004 workflow.
4. **DB-101 and DB-102 — Correct embedding infrastructure.**
   - Align the Gemini query metric and index operator class.
   - Remove or redirect broken legacy tables, indexes, and RPC contracts.
   - DB-101 design and benchmarking may begin earlier, but production deployment remains gated by DB-001 and DB-004.
5. **DB-103 through DB-105 — Complete schema hardening.**
   - Simplify and optimize RLS policies.
   - Add justified foreign-key indexes.
   - Add validated database constraints using appropriate low-lock rollout patterns.

Critical-path shorthand:

`Phase 0 safeguards → DB-001 → DB-004 → DB-002 → DB-101/DB-102 → DB-103/DB-104/DB-105`

Current position on 2026-07-22: DB-001, DB-002, DB-004, and DB-101 through DB-106 are Verified, completing the planned schema-hardening and public-RPC critical path. DB-004 includes a disposable hosted replay, protected `main` rules, and observed Vercel withholding and post-success promotion behavior on normal production releases. The remaining authenticated DB-002 user-path check is operational follow-up rather than a database-protection gate. DB-003 has verified independent Storage and local restore evidence, but paid hosted retention/PITR and alerts remain launch gates; the project intentionally remains on the free plan while usage and revenue are low. DB-107 and DB-203 are the next security and operational workstreams while DB-003 continues in parallel.

### Parallel launch gates

Start these alongside the critical path. All must be complete before production launch even though they do not all block one another:

- **DB-003 — Production plan, backup, Storage recovery, RPO, and RTO.**
- [x] **DB-106 — Public email/token RPC review completed on 2026-07-22.**
- **DB-107 — Auth, SSL, network, SMTP, connection, and secret-rotation controls.**
- **DB-203 — Capacity, query, worker, security, backup, and restore monitoring.**

Do not postpone DB-203 behind longer-term architecture work. Monitoring and a successful restore drill are launch requirements.

### Post-stabilization work

Complete these after preventive controls and the critical production path are stable:

1. **DB-201 — Repair minor data inconsistencies.**
   - Diagnose and prevent each inconsistency before running repair SQL.
2. **DB-202 — Make longer-term schema decisions.**
   - Content revisions, multi-author/category/source models, publishing lifecycle, and JSON versioning should follow concrete product requirements.

### Rules for parallel work

- Parallel design, test authoring, and benchmarking are encouraged when they do not modify production or create conflicting migration files.
- Assign one owner to coordinate migration versions and merge order while DB-001 is active.
- A workstream may not bypass an unmet acceptance criterion from an earlier critical-path dependency.
- Update the master tracker status and work log whenever a phase starts, becomes blocked, or is verified.
- Record advisor results, verification commands, rollback evidence, and restore evidence under the relevant work item.
