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
- The client cache key includes the authenticated account ID, a client authentication epoch, collection, normalized query, sort, direction, and schema version. Changing any of these discards the cursor and begins at the first page.
- Logout, account switch, session replacement, and account deletion increment the authentication epoch, cancel in-flight account-data requests, clear account-scoped query caches and rendered replica state, and clear any decrypted snapshot data. Guest state remains in its separate guest scope.
- Every request captures `{ accountId, authenticationEpoch }` before it starts. A response may update state only when both values still equal the active session when it settles; otherwise it is discarded even if the server response itself was authorized. This prevents an in-flight Account A response from rendering after Account B signs in.

For `user_library`, add a non-null server-maintained `library_updated_at` and use `library_updated_at DESC, content_id ASC`. Existing rows are backfilled once in the migration. This avoids nullable `last_interacted_at` ordering and gives every mutation a deterministic ordering key. All other collection orders are listed in the inventory.

### 2.3 Live concurrent changes

Live paging intentionally makes no snapshot claim. A newly saved or removed row may appear/disappear after a refresh. The UI deduplicates by stable ID, keeps the newest value, displays the server count, and offers refresh. It must not render “all records synchronized” merely because the current live list ended.

## 3. Cross-collection snapshot mechanism for full sync and export

### Chosen mechanism: persisted immutable snapshot records

The implementation creates a server-owned snapshot in a **single `REPEATABLE READ` PostgreSQL transaction** using a parameterized server database connection after the session has been authenticated. At this isolation level PostgreSQL keeps successive reads on the transaction’s stable snapshot; a conflicting write transaction can require retry, which the creation path handles as a typed retryable failure. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) It does not attempt to approximate the boundary by issuing independent browser or PostgREST queries.

Within that transaction it:

1. verifies the authenticated account and requested allowed collections;
2. creates `account_data_snapshots` with the operation’s allocated `id`, `operation_id`, `account_id`, `schema_version`, requested collections, `created_at`, `expires_at`, and status `building`;
3. reads every authorized record/projection from each included collection using the inventory’s canonical order;
4. writes its export-safe field values to `account_data_snapshot_records(snapshot_id, collection, ordinal, record_id, payload)`;
5. writes per-collection counts and sets status `ready` before commit.

The transaction’s first data read establishes the boundary. Consequently an export created at that boundary includes exactly the membership and field values visible then across *all* included collections. A later create is excluded; a later update, delete, or replacement does not alter the stored snapshot payload.

### Snapshot authorization, storage, and deletion

`account_data_snapshot_operations`, `account_data_snapshots`, and `account_data_snapshot_records` live in the non-exposed `private` schema, not `public`. The migration enables and forces RLS, revokes all table, sequence, schema, and function privileges from `PUBLIC`, `anon`, and `authenticated`, and grants the minimum transaction privileges only to the `netflux_snapshot_worker` server-only database role. No browser Supabase client, Data API route, or public RPC receives a grant or a policy for these tables. This protects against both accidental Data API exposure and a future permissive `public`-schema default; Supabase treats grants and RLS as distinct access controls, and recommends keeping internal objects outside the API surface. [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api)

The Next.js server authenticates the session before opening the worker transaction, sets a transaction-local account binding, and uses parameterized queries only. Snapshot creation and reads apply that binding to every source and snapshot row. The web route re-checks the active account before returning any snapshot metadata or page; a snapshot ID is never sufficient authority. The worker credential is server-only and is not a `NEXT_PUBLIC_` value.

Account deletion first revokes sessions and marks the account unavailable to snapshot routes, then deletes operation records, snapshot records, and parent snapshots in the same account-deletion workflow. A foreign key cascade handles records after the parent is selected for deletion; a deletion audit records counts but never payloads. Cleanup also removes expired snapshots. If cleanup fails, expired or account-deleted snapshots remain denied by the server and RLS, cleanup retries with backoff, and an alert fires for any snapshot older than 26 hours.

Required security tests attempt direct Data API access as `anon` and `authenticated`, direct ordinary-client table access, a foreign snapshot ID through the endpoint, and access after logout/account deletion. All fail closed; only the server route for the active owner can read a ready snapshot.

### Snapshot creation bounds and lifecycle

Snapshot creation accepts an immutable client-generated idempotency key. First, in a short **separately committed** operation transaction, the server inserts `account_data_snapshot_operations` with `(account_id, idempotency_key)` as its unique key, the canonical requested collection list, schema version, request fingerprint, allocated snapshot ID, status, lease expiry, and no payload. Reusing a key with a different collection list, schema version, or request fingerprint returns `IDEMPOTENCY_KEY_REUSED` (409). An identical retry first reconciles its operation against the allocated snapshot root: a committed ready root is finalized and returned as `ready`; otherwise it returns the recorded `building` or terminal failure result and never starts another copy.

The worker then claims the operation with a lease and performs the snapshot root and payload copy in the separate atomic `REPEATABLE READ` transaction described above. Once that transaction commits, it separately commits the operation outcome as `ready`. If the copy transaction rolls back, it separately records a stable typed terminal failure. Thus a copy rollback never erases the idempotency outcome, while an operation record never makes a partial payload readable.

Crashes and ambiguous database commits recover from the operation record rather than retrying blindly. The worker refreshes its lease every five seconds. A sweeper only takes an expired `building` lease after acquiring the same advisory lock; if the lock is still held, it leaves the operation building. Once it owns the lock, a committed `ready` root and manifest finalizes the operation as `ready`; no root finalizes `SNAPSHOT_ABORTED`; any other state remains unavailable and is escalated. A connection loss after payload commit but before the response is therefore resolved to the same ready snapshot on retry. A request with a terminal failure returns that same failure for its key; a new snapshot attempt requires a new key. A transaction advisory lock permits at most one building snapshot per account; a global worker limit permits at most four concurrent creations. The server rate-limits new keys to six per account per hour and returns `SNAPSHOT_IN_PROGRESS` or `SNAPSHOT_RATE_LIMITED` with retry guidance instead of starting duplicate copies.

The initial synchronous path has three hard limits: **10,000 records**, **25 MiB** of canonical serialized payload, and a **30-second transaction deadline** (with a 15-second statement timeout). Preflight counts run under the owner predicate; record and byte limits are checked while copying. Hitting any limit, timing out, losing the database connection, or receiving a serialization failure rolls back the complete transaction and returns a typed incomplete result such as `SNAPSHOT_TOO_LARGE` or `SNAPSHOT_TIMED_OUT`. It never returns a truncated or partially ready snapshot. An oversized account receives that explicit failure until a separately reviewed background snapshot path exists; background work is not implied by this design.

Snapshots expire after **24 hours**. A successful cleanup runs hourly; an expired snapshot returns `SNAPSHOT_EXPIRED` immediately even if physical deletion has not yet succeeded. Creation metrics record result, elapsed time, record count, byte count, retry/idempotency outcome, and cleanup age without recording account data.

Snapshot reads are authorized again by account ID and stream only persisted snapshot rows ordered by `(collection, ordinal)`. Their cursor is signed and bound to the snapshot ID, account, collection, and ordinal. An expired snapshot returns `SNAPSHOT_EXPIRED`, never a partial replacement traversal.

If the database connection is unavailable before the operation record commits, creation fails without an operation. If it becomes unavailable after a claim, the operation records a typed failure or is recovered from its expired lease as described above. The product reports an incomplete export/full sync and offers retry; it never falls back to multiple independent queries.

### Full synchronization

For library hydration, capture `{ accountId, authenticationEpoch, hydrationGeneration, resetEpoch, localAcknowledgementSequence }` before requesting a snapshot limited to `user_library`. Starting another hydration increments `hydrationGeneration` and aborts the older traversal. Snapshot metadata includes its account reset epoch and boundary library revision.

The client exhausts the snapshot pages, verifies that received unique IDs and values equal the snapshot’s per-collection count and manifest hash, then may install it only when the active account/authentication epoch and the current hydration generation still match. It additionally compares reset epochs: a snapshot from an earlier epoch is discarded, while an acknowledged reset at the same or later point invalidates all prior visible state and starts a new hydration.

An acknowledged save, removal, or progress mutation after the snapshot boundary is never overwritten by snapshot installation. Its server revision and reset epoch are retained in a separate acknowledged-mutation overlay and applied after the verified snapshot; a reset overlay wins over all earlier rows. Pending durable mutations stay in a separate optimistic queue/overlay and are not treated as snapshot data or server acknowledgement. A failed or stale queued mutation remains `needs attention` rather than being silently replayed or erased.

Only after this generation, epoch, checksum, and overlay reconciliation succeeds may the client replace the committed server replica. Until then it retains the prior replica and shows `pending` or `needs attention`; it never labels a partial or superseded traversal synced. No hydration read enqueues an upsert. Explicit writes and durable queued mutations remain the only source of server mutations, and use the revision/reset-epoch checks in the lifecycle contract.

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
| Account-switch cache isolation | Start an Account A page request, keep it in flight, then sign out and sign in as B before it resolves. Repeat with an in-flight snapshot page. | A’s request is aborted or its late response is discarded by account/authentication epoch; A’s query cache, rendered replica, and decrypted snapshot data are cleared before B renders. |
| Interrupted page | Fail page N in a snapshot traversal and separately expire a cursor before page N. | No complete manifest/export is emitted; the client exposes recoverable incomplete state; retry starts a new or still-valid snapshot explicitly. |
| Live concurrent change | Between live pages, add, edit, and delete A’s rows around the page boundary. | UI deduplicates by stable ID, permits refresh, and makes no snapshot/completeness claim. |
| Snapshot concurrent change | Create snapshot; then add one row, edit one row, and delete-and-replace one row while paging it. | Export equals the recorded membership *and values* at the snapshot boundary; it neither mixes changes nor passes from matching counts alone. |
| Hydration/write race | During a library snapshot traversal, acknowledge a save, a removal, a progress update, and a library reset in separate runs; start a second hydration before the first completes. | Only the current hydration generation may install. Later acknowledged revisions overlay the snapshot; a newer reset discards it; pending mutations remain separate; no acknowledged visible state regresses. |
| Stale queued save | Device A queues save offline with base revision/epoch. Device B removes the bookmark; repeat with B performing a library reset. | Replay is rejected with current state, does not resurrect data, preserves queue record for explicit resolution, and never becomes synced automatically. |
| Stale queued removal | Device A queues removal while B changes the same record. | Server applies only a valid base revision or returns conflict/current state; no automatic rebase changes B’s newer state. |
| Guest migration | Guest has bookmark/progress captures; sign in to A; retry same migration ID; interrupt between records; separately reset A before replay. | Eligible records migrate exactly once; retry is idempotent; no newer authenticated state is overwritten; post-reset replay is rejected/skipped visibly. |
| Export coverage | A has at least one record in every inventory collection, including a reflection and user-visible request notification. | The complete export contains every expected record once, omits secret/internal fields, and its counts and hashes match the manifest. |
| Snapshot direct access | Attempt `anon`, authenticated ordinary-client, and Data API reads/writes against all private operation/snapshot tables and snapshot helper functions. | Every direct attempt is denied; the tables are absent from the API surface; only the server worker route can create/read the active owner’s snapshot. |
| Snapshot creation concurrency | Submit duplicate and distinct idempotency keys concurrently for one account, then exceed the per-account creation rate. | Same key returns one result; a distinct concurrent key does not create a second building copy; limits return typed retryable responses without partial snapshots. |
| Snapshot bounds and cleanup | Use an over-record-limit account, an over-byte-limit account, a forced transaction timeout/serialization retry, and an expired snapshot with a failed cleanup attempt. | Each creation fails explicitly without truncation; ready snapshots remain unavailable after expiry even when physical cleanup retries; alert/metric evidence is produced. |
| Snapshot operation recovery | Force a copy timeout; terminate the worker after the operation record commits but before copying; terminate it after payload commit but before outcome finalization; then lose the successful HTTP response. | The operation persists a stable timeout/aborted result when no snapshot committed, recovery finalizes a committed payload as `ready`, and retrying the same request returns the same operation/snapshot outcome without a duplicate copy. |

The test suite also asserts that the configured Data API cap is read from `supabase/config.toml` and fixtures remain strictly above it. Tests must not encode 1,000 as an unexplained magic number.

## 5. Benchmark baseline and release thresholds

### Baseline record

Before changing #2–#6, add a versioned synthetic retrieval corpus and a checked-in result record at `tests/fixtures/retrieval/baseline-v1.json`. The record contains fixture version, application commit, provider/model configuration, prompt version, run date, each case result, aggregate method, and every raw model-dependent run.

The baseline must be generated against the current behavior before the retrieval implementation begins. It must explicitly record `not-supported` for a capability the current product lacks; that is evidence of the present boundary, not a zero or a passing result. We will not invent a numeric current result before the runner exists.

The runner uses a versioned retrieval budget of **8 evidence items** and **4,000 evidence tokens** after authorization and before generation. Token counting uses the recorded tokenizer/model configuration. Eligible-evidence recall is `required eligible evidence IDs returned / required eligible evidence IDs in the case`: optional related evidence is not in the denominator. A class score is the arithmetic mean of its case scores; the headline score is a macro-average of the three required evidence classes, so a large highlight fixture cannot drown out reflections or source segments.

The required classes are **source segments**, **highlights** (selection text and note-bearing variants), and **reflections**. The minimum corpus is 12 positive cases per class, including four exact-quote cases and four distractor/near-match cases; six mixed-scope cases; eight authorized no-evidence/withdrawn cases; and eight deterministic exclusion cases split across unauthorized, user-deleted, and revoked access. Each case declares its required IDs, eligible IDs, allowed citation states, and whether abstention is required. Cases have equal weight within their class; no hand-tuned per-case weighting is allowed without an approved fixture-version change.

### Proposed numeric release thresholds — approval required

These are the numbers to approve in this review. Once approved they become fixture assertions before implementation begins:

| Metric | Proposed threshold | Measurement |
| --- | --- | --- |
| Cross-account disclosure | **0** | Deterministic isolation suite. |
| Invalid citation reference | **0** | Deterministic citation validation suite. |
| Exact quotation fidelity | **100%** | Every quotation fixture byte-matches its authorized stored evidence. |
| Eligible-evidence recall | **>= 95%** macro-average and **>= 90%** for every required-evidence class | Required eligible evidence appears in the fixed eight-item/four-thousand-token retrieval budget. |
| Irrelevant-source rejection | **>= 95%** | Deliberate distractors are absent where the fixture requires abstention/exclusion. |
| Model abstention | **>= 95%** | Authorized no-evidence and withdrawn cases abstain rather than fabricate. |
| Unauthorized/deleted/revoked evidence exclusion | **100%** | Deterministic authorization and citation resolution rejects every unavailable or foreign record before ranking or generation. |
| Regression tolerance | **0 percentage-point regression** on the deterministic metrics; no unexplained decline on model-dependent aggregates | Compare against the recorded baseline. |

Every deterministic metric must pass in every run. Run every model-dependent case at least three times under the fixed recorded configuration. For recall, the three-run macro mean must be >=95%, each class mean must be >=90%, every run’s macro score must be >=90%, and every run’s class score must be >=85%. For irrelevant-source rejection and model abstention, the three-run mean must be >=95% and every run must be >=90%. Report each run, class score, mean, minimum, budget consumption, and pass/fail. A deterministic failure, an unapproved threshold, an unmet mean/floor, or an unexplained regression blocks the retrieval release.

## 6. Implementation slices and review gates

1. **Review this design:** approve inventory details, snapshot access/deletion contract, 24-hour maximum availability, creation bounds, cursor fields, and benchmark thresholds.
2. **#7 access path:** migration for deterministic library ordering; server list/snapshot service; account-scoped cache/hydration replacement; and over-cap, tie, switch, hydration-race, isolation, interruption, direct-access, creation-concurrency, resource-bound, cleanup, and operation-recovery fixtures. Snapshot security and resource controls are release-blocking here, when the service first ships.
3. **#10 complete export:** add every inventory adapter; export manifest/checksum assembly; and cross-collection membership/value-boundary and export-coverage fixtures.
4. **Dependent work only after the above review:** server-side search (#2/#12/#13), typed personal retrieval (#3/#4/#6), and citations (#5/#18).

No release gate is satisfied by this design document alone. The implementation PRs must include the listed fixtures and the evidence they produce.
