# Phase 1 access path and complete-export design

**Status:** Review handoff — proposed; no production change is authorized by this document

**Depends on:** [Phase 1 trustworthy retrieval contract](./PHASE_1_TRUSTWORTHY_RETRIEVAL_CONTRACT.md), including its lifecycle, stale-mutation, guest-migration, and evidence-identity decisions.

**Implements after approval:** #7 complete access, then #10 complete export. It deliberately does not implement search, AI retrieval, or citations.

## Decision summary

1. Use server-authorized keyset pagination for interactive owned-data lists. The cursor is opaque, signed, short-lived, and bound to the authenticated account, collection, normalized filter, and sort.
2. Use a server-created immutable snapshot for full synchronization and export. It persists a copy of the included records at one logical database snapshot, so membership and field values remain stable while the client pages through it.
3. Hydrate an authenticated library only from a completed `user_library` snapshot. It does not publish a partial server replica as complete and it never writes cached values back during hydration.
4. Treat counts as metadata obtained on the server. A client never infers completion from a short page.

## 1. Owned-data inventory

This is the implementation inventory for the lifecycle contract. “Current consumer” identifies code that presently reads or mutates the collection; it is not permission to retain data beyond the contract.

| Collection / export name | Ownership and included fields | Canonical order for traversal | Deletion and reset rule | Current consumers |
| --- | --- | --- | --- | --- |
| `profiles` / `preferences` | One row owned by `profiles.id`; export non-privileged preferences, onboarding state, and reader settings. Exclude role, internal flag, credentials, and sessions. | `id ASC` (single row) | Retained through library reset; removed through account deletion. | Settings, public layout/auth, profile header, admin authorization. |
| `user_library` / `library` | Composite key `(user_id, content_id)`; bookmark state, progress, interaction timestamp, reset epoch, and server revision. | `library_updated_at DESC, content_id ASC` | “Clear Reading History & Library” clears server rows, local mirrors, and queued mutations, then advances the account reset epoch. Bookmark removal records an unbookmark/tombstone before any eligible row is physically compacted. | `useReadingProgress`, library pages, reader, content cards, recommendations, Ask My Library. |
| `user_highlights` / `highlights` | Each row belongs to `user_id`; include selected text, note, color, anchors, content and segment references. | `created_at DESC NULLS LAST, id ASC` | A single highlight deletion removes it. The separate “Delete notes and highlights” control deletes all highlights. A history deletion includes them only when its explicit option says so. Library reset does not delete them. | Notes page, reader, highlights API, notes chat, history deletion. |
| `user_reflections` / `reflections` | Each row belongs to `user_id`; include prompt, reflection text, content reference, and timestamps. | `updated_at DESC, id ASC` | Delete through the reflection control/API. It is not covered by the current notes-and-highlights control or library reset unless the control wording and implementation are expanded together. | Reader reflection UI, notes page, reflections API, personal retrieval. |
| `reading_activity` / `reading_activity` | Daily row owned by `user_id`; include day, duration, pages, and timestamps. | `activity_date DESC, id ASC` | Cleared by “Clear Reading History & Library”; retained otherwise until account deletion. | Activity routes, streak/progress views, settings export, admin aggregates. |
| `content_feedback` / `content_feedback` | Each feedback row belongs to `user_id`; include content reference, sentiment, reason, details, and timestamps. | `created_at DESC, id ASC` | User can remove a feedback item. It is not silently deleted by a library reset. | Content feedback API and content UI; admin aggregate insights. |
| `content_requests` projection / `submitted_requests` | Export only records whose `submitted_by` is the account. Include the user-visible current request state, not other participants’ personal data. | `created_at DESC, id ASC` | A request follows request-board visibility/retention policy; account deletion removes or anonymizes submitter linkage according to the approved privacy decision. Library reset has no effect. | Request board, admin request workflow, notifications. |
| `content_request_votes` / `request_votes` | Each vote is owned by `user_id`; include request ID and creation time. | `created_at DESC, request_id ASC` | Removing a vote removes that row. Account deletion removes votes. Library reset has no effect. | Request-board voting and request aggregation. |
| `user_notification_preferences` / `notification_preferences` | One row owned by `user_id`; include user-visible opt-in fields and timestamps. Exclude unsubscribe token. | `user_id ASC` (single row) | Retained through library reset; removed with account deletion. A replacement export import, if ever offered, must mint a new unsubscribe token. | Notification-preferences API, settings, notification worker. |
| `content_request_notifications` projection / `request_notifications` | Export only user-visible notification type, associated request, state, and timestamps for `user_id`. Exclude provider message ID, delivery errors, attempts, and processing internals. | `created_at DESC, id ASC` | Retention follows the approved notification-record policy; account deletion removes the account association. Library reset has no effect. | Notification worker and request-board user history. |
| `ai_message_usage` / `ai_usage` | Each metadata row belongs to `user_id`; include feature and timestamps only. Never export raw prompt, model context, or private evidence telemetry. | `created_at DESC, id ASC` | Retained through library reset; account deletion follows the approved analytics-retention policy. | AI quota enforcement and aggregate operations reporting. |

### Inventory rules

- A collection becomes exportable only after its row identity, owner predicate, order, and retention rule appear in this table and its snapshot adapter.
- Shared tables are exported as an account-scoped projection. The exporter must never copy another account’s vote, notification, profile, or internal operational field.
- `content_item` and `segment` are referenced context, not account-owned collections. The export preserves IDs and the stored personal capture; it does not imply continuing entitlement to editorial content.
- Account deletion is a separate approved process and is not implemented by this work.

## 2. Concrete access design for #7

### 2.1 Service boundary and callers

Introduce one server-side owned-data access module with two paths:

| Path | Route / module | Use |
| --- | --- | --- |
| Live list | `GET /api/account-data/{collection}` backed by `lib/server/account-data-access.ts` | Interactive notes, reflections, and library views. It is eventually consistent. |
| Consistent traversal | `POST /api/account-data/snapshots`, then `GET /api/account-data/snapshots/{snapshotId}/{collection}` | Authenticated library hydration/full sync and #10 export. It is immutable until expiry. |

The server obtains the account from the session on every request. Neither an account ID in the URL nor a cursor authorizes access. Existing direct browser-table reads in `useReadingProgress`, settings export, Ask My Library metadata, and the reflection list are replacement targets; their one-query behavior must not remain as a second path.

The first delivery scope is `user_library`, including a completion-aware hydration helper. Highlights and reflections adopt the same list contract in their respective work items, not by duplicating cursor code.

### 2.2 Live-list response and cursor

Example response:

```json
{
  "data": [{ "content_id": "…", "is_bookmarked": true, "progress": {} }],
  "pageInfo": {
    "hasNextPage": true,
    "endCursor": "opaque-signed-token",
    "totalCount": 1327,
    "queryVersion": 1
  }
}
```

- Default page size is **100**; accepted range is 1–200. It is independent of Supabase’s current 1,000-row response cap.
- The normalized request contains only declared filters, sort, direction, and collection schema version. It is serialized canonically and hashed before a cursor is issued.
- Cursor payload: `{ v, accountBinding, collection, sort, filterHash, after, expiresAt }`. `after` contains every ordered field and the immutable tie-breaker. The payload is authenticated with a server secret and is not client-editable.
- On the next request, the server checks token integrity, expiry, account binding, collection, sort, and filter hash before applying the keyset predicate. A mismatch returns `CURSOR_INVALID` (400) and tells the client to restart, never an empty successful page.
- A list response supplies `hasNextPage` based on fetching `pageSize + 1` rows. It supplies `totalCount` from an authorized aggregate query. A short page is not completion evidence by itself.
- The client cache key includes collection, normalized query, sort, direction, and schema version. Changing any of these discards the cursor and begins at the first page.

For `user_library`, add a non-null server-maintained `library_updated_at` and use `library_updated_at DESC, content_id ASC`. Existing rows are backfilled once in the migration. This avoids nullable `last_interacted_at` ordering and gives every mutation a deterministic ordering key. All other collection orders are listed in the inventory.

### 2.3 Live concurrent changes

Live paging intentionally makes no snapshot claim. A newly saved or removed row may appear/disappear after a refresh. The UI deduplicates by stable ID, keeps the newest value, displays the server count, and offers refresh. It must not render “all records synchronized” merely because the current live list ended.

## 3. Cross-collection snapshot mechanism for full sync and export

### Chosen mechanism: persisted immutable snapshot records

The implementation creates a server-owned snapshot in a **single `REPEATABLE READ` PostgreSQL transaction** using a parameterized server database connection after the session has been authenticated. It does not attempt to approximate the boundary by issuing independent browser or PostgREST queries.

Within that transaction it:

1. verifies the authenticated account and requested allowed collections;
2. creates `account_data_snapshots` with `id`, `account_id`, `schema_version`, requested collections, `created_at`, `expires_at`, and status `building`;
3. reads every authorized record/projection from each included collection using the inventory’s canonical order;
4. writes its export-safe field values to `account_data_snapshot_records(snapshot_id, collection, ordinal, record_id, payload)`;
5. writes per-collection counts and sets status `ready` before commit.

The transaction’s first data read establishes the boundary. Consequently an export created at that boundary includes exactly the membership and field values visible then across *all* included collections. A later create is excluded; a later update, delete, or replacement does not alter the stored snapshot payload.

Snapshot reads are authorized again by account ID and stream only persisted snapshot rows ordered by `(collection, ordinal)`. Their cursor is signed and bound to the snapshot ID, account, collection, and ordinal. Snapshots expire after **24 hours** and are removed by a scheduled cleanup. An expired snapshot returns `SNAPSHOT_EXPIRED`, never a partial replacement traversal.

If the database connection required for `REPEATABLE READ` is unavailable, snapshot creation fails before returning a snapshot ID. The product reports an incomplete export/full sync and offers retry; it never falls back to multiple independent queries.

### Full synchronization

For library hydration, request a snapshot limited to `user_library`, exhaust its pages, verify that received unique IDs and values equal the snapshot’s per-collection count and manifest hash, then atomically replace the local *replica*. Until all checks pass, retain the prior replica and show `pending` or `needs attention`; do not label it synced.

No hydration read enqueues an upsert. Explicit writes and durable queued mutations remain the only source of server mutations, and use the revision/reset-epoch checks in the lifecycle contract.

### Export assembly

The export endpoint requests the complete inventory snapshot, exhausts every collection, and emits:

```json
{
  "manifest": {
    "schemaVersion": 1,
    "snapshotId": "…",
    "boundaryCreatedAt": "…",
    "collections": [{ "name": "reflections", "count": 42, "sha256": "…" }]
  },
  "collections": { "reflections": [] }
}
```

`sha256` is over the canonical ordered payload stream for that collection. The exporter succeeds only when every collection’s received count and hash equal its snapshot manifest. Any page error, duplicate ID, missing ordinal, expired cursor, cancellation, or checksum mismatch yields an incomplete result with affected collection names and no “export complete” toast/download.

## 4. Acceptance fixtures

Fixtures are synthetic, account-scoped, deterministic, and committed with a manifest version. They do not contain production user text. Test account A and test account B are ordinary readers with no administrative role.

| Fixture | Setup | Required assertion |
| --- | --- | --- |
| Over-cap library | Account A has **1,201** library rows, including progress-only and bookmark-only rows; page size is 100. | Eleven-plus pages return every expected `content_id` exactly once; `totalCount` is 1,201; completed snapshot hydration matches its manifest. |
| Timestamp ties | At least 250 highlights and 250 reflections share the same primary sort timestamp, with distinct IDs. | Traversal is deterministic, contains every ID once, and does not skip or duplicate the tie boundary. |
| Account isolation | Both accounts have rows with deliberately similar IDs/content references. Reuse A’s cursor/snapshot ID/requested record against B. | B receives no A data; invalid tokens/foreign snapshot IDs fail closed; no list, export, full sync, or later citation fixture crosses account boundary. |
| Interrupted page | Fail page N in a snapshot traversal and separately expire a cursor before page N. | No complete manifest/export is emitted; the client exposes recoverable incomplete state; retry starts a new or still-valid snapshot explicitly. |
| Live concurrent change | Between live pages, add, edit, and delete A’s rows around the page boundary. | UI deduplicates by stable ID, permits refresh, and makes no snapshot/completeness claim. |
| Snapshot concurrent change | Create snapshot; then add one row, edit one row, and delete-and-replace one row while paging it. | Export equals the recorded membership *and values* at the snapshot boundary; it neither mixes changes nor passes from matching counts alone. |
| Stale queued save | Device A queues save offline with base revision/epoch. Device B removes the bookmark; repeat with B performing a library reset. | Replay is rejected with current state, does not resurrect data, preserves queue record for explicit resolution, and never becomes synced automatically. |
| Stale queued removal | Device A queues removal while B changes the same record. | Server applies only a valid base revision or returns conflict/current state; no automatic rebase changes B’s newer state. |
| Guest migration | Guest has bookmark/progress captures; sign in to A; retry same migration ID; interrupt between records; separately reset A before replay. | Eligible records migrate exactly once; retry is idempotent; no newer authenticated state is overwritten; post-reset replay is rejected/skipped visibly. |
| Export coverage | A has at least one record in every inventory collection, including a reflection and user-visible request notification. | The complete export contains every expected record once, omits secret/internal fields, and its counts and hashes match the manifest. |

The test suite also asserts that the configured Data API cap is read from `supabase/config.toml` and fixtures remain strictly above it. Tests must not encode 1,000 as an unexplained magic number.

## 5. Benchmark baseline and release thresholds

### Baseline record

Before changing #2–#6, add a versioned synthetic retrieval corpus and a checked-in result record at `tests/fixtures/retrieval/baseline-v1.json`. The record contains fixture version, application commit, provider/model configuration, prompt version, run date, each case result, aggregate method, and every raw model-dependent run.

The baseline must be generated against the current behavior before the retrieval implementation begins. It must explicitly record `not-supported` for a capability the current product lacks; that is evidence of the present boundary, not a zero or a passing result. We will not invent a numeric current result before the runner exists.

### Proposed numeric release thresholds — approval required

These are the numbers to approve in this review. Once approved they become fixture assertions before implementation begins:

| Metric | Proposed threshold | Measurement |
| --- | --- | --- |
| Cross-account disclosure | **0** | Deterministic isolation suite. |
| Invalid citation reference | **0** | Deterministic citation validation suite. |
| Exact quotation fidelity | **100%** | Every quotation fixture byte-matches its authorized stored evidence. |
| Eligible-evidence recall | **>= 95%** aggregate and **>= 90%** for every required-evidence class | Expected eligible evidence appears in bounded retrieval results. |
| Irrelevant-source rejection | **>= 95%** | Deliberate distractors are absent where the fixture requires abstention/exclusion. |
| Correct abstention | **>= 95%** | Approved no-evidence, deleted, withdrawn, and unauthorized cases abstain rather than fabricate. |
| Regression tolerance | **0 percentage-point regression** on the deterministic metrics; no unexplained decline on model-dependent aggregates | Compare against the recorded baseline. |

Run every model-dependent case at least three times under the fixed recorded configuration. Report each run, the arithmetic mean, minimum, and pass/fail against the threshold. A deterministic failure, an unapproved threshold, an unmet threshold, or an unexplained regression blocks the retrieval release.

## 6. Implementation slices and review gates

1. **Review this design:** approve inventory details, 24-hour snapshot retention, cursor fields, and benchmark thresholds.
2. **#7 access path:** migration for deterministic library ordering; server list/snapshot service; library hydration replacement; over-cap, tie, isolation, and interruption fixtures.
3. **#10 complete export:** add every inventory adapter; export manifest/checksum assembly; cross-collection snapshot and export-coverage fixtures.
4. **Dependent work only after the above review:** server-side search (#2/#12/#13), typed personal retrieval (#3/#4/#6), and citations (#5/#18).

No release gate is satisfied by this design document alone. The implementation PRs must include the listed fixtures and the evidence they produce.
