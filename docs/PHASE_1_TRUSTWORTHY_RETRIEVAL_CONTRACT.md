# Phase 1: trustworthy retrieval and operational readiness

**Status:** Proposed contract — requires product and technical approval before dependent implementation

**Date:** 9 September 2026
**Source:** [Blind-spot audit](./NETFLUX_BLIND_SPOTS_2026-09-08.md)

## Purpose and phase boundary

Phase 1 makes one promise dependable: an ordinary user can save an idea, return later on another session or device, recover the correct owned evidence, and open the supporting passage without the system silently omitting data or overstating certainty.

This is a contract and roadmap, not an authorization to change production data, hosted settings, or user-facing behavior. The contracts below are decisions that must be approved before their dependent implementation begins. Operational drills, AI safeguards, and later product experiments may proceed independently and do not block the first complete-access change.

Phase 1 has four delivery tracks:

1. **Core retrieval:** complete access, reliable search, typed personal-evidence retrieval, and validated citations.
2. **Durability:** bookmark conflict handling, visible/recoverable synchronization, and a complete export.
3. **Proof and safeguards:** retrieval benchmark, authenticated journey, outcome measurement, AI admission/cost controls, and operational evidence.
4. **Applicable release gates:** indexing readiness, WebKit/accessibility checks, and capacity proof.

The following remain outside the Phase 1 delivery scope unless their listed trigger occurs: resurfacing and saved-synthesis experiments; onboarding experimentation; a full editorial-history system; and a proof of competitive advantage. They remain tracked in the register below.

## Approval gates

The following decisions are prerequisites, not implementation tasks that can be inferred during coding:

| Contract | Required decision | Unblocks |
| --- | --- | --- |
| Owned-data lifecycle | What constitutes owned data; what each removal control removes; server/local authority; retention and export inventory. | #7–#11, #23 |
| Pagination and traversal | Stable ordering, cursor/query binding, completion state, and concurrent-change semantics. | #2, #7, #10, #12–#13 |
| Evidence identity | What a citation identifies; revision/context representation; changed and unavailable evidence behavior. | #3–#6, #18–#19 |
| Evaluation baseline | Synthetic corpus, expected evidence, baseline result record, and pass criteria. | #25–#26, #29 |

## 1. Owned-data lifecycle contract

### 1.1 Authority and synchronization

- For an authenticated account, the server is the canonical state. Browser storage is a replica/cache and may never turn a hydration read into a cloud write.
- Only an explicit user action or a durable queued mutation may change server state. Re-opening an older client must not reassert its cached bookmark, progress, or other local value.
- Every queued mutation has an immutable client-generated idempotency ID, record type/key, intended change, local creation time, and a server acknowledgement state. Retrying the same mutation cannot apply it twice.
- The client displays one of **synced**, **pending**, or **needs attention** for user knowledge. A failed write, interrupted traversal, or unactionable conflict must never be presented as safely synced.
- Pending mutations retry after reconnection and on an explicit user retry. They remain durable until acknowledged, explicitly discarded by the user, or superseded by a documented server result.
- A simultaneous explicit action is serialized by the server. The accepted server revision is authoritative; an automatic hydration path is never a competing mutation. The delivery design must document the user-visible outcome of a stale explicit mutation.

### 1.2 Bookmark removal and reset semantics

- A bookmark removal is a first-class server state change, not an absence inferred from a stale local list. The implementation must retain an unbookmark state or a server-side mutation/tombstone sufficient to reject a stale cached bookmark.
- Bookmark state carries a server-assigned revision. A device may refresh and display that state, but may not write it back merely because it was previously cached.
- State needed to prevent resurrection remains available while the account is active. A library reset is represented by a server-recorded reset revision/epoch so an older device cannot restore cleared records.
- “Clear Reading History & Library” must remove the server library state, reading activity, queued local mutations, and local mirrors covered by that label. Highlights and reflections remain separate controls unless the label explicitly includes them.
- Account deletion is a documented, owned process. It must cover the inventory below, active sessions, analytics identifiers, and any narrowly justified retained suppression/security records. This contract does not require self-service account deletion.

### 1.3 Owned-data inventory and export scope

The versioned export inventory includes every account-owned record below. The export contains stable identifiers, relevant timestamps, source/context references needed to interpret the record, a per-collection count, and a manifest version.

| Data group | Current records | Export rule |
| --- | --- | --- |
| Account preferences | `profiles` non-privileged fields and reader settings | Include; exclude credentials and privileged role-only data. |
| Library state | `user_library` | Include bookmark state, progress, interaction metadata, and any necessary reset/version context. |
| Captures | `user_highlights`, `user_reflections` | Include full stored text, note/reflection content, anchors, source IDs, and timestamps. |
| History and feedback | `reading_activity`, `content_feedback` | Include all owned rows. |
| Request-board participation | submitted `content_requests`, `content_request_votes` | Include the user’s requests and votes, with current request state. |
| Notification preferences and records | `user_notification_preferences`, user-facing `content_request_notifications` | Include user-visible preference and notification information; exclude/reissue secret unsubscribe tokens and internal-only delivery diagnostics. |
| AI usage metadata | `ai_message_usage` | Include account-scoped feature/timestamp metadata, never raw prompts or private evidence copied into telemetry. |

The export is a completed snapshot traversal, not a best-effort page. If any collection cannot be traversed to completion, the export fails with the affected collection and does not claim success. An export may describe a snapshot boundary; it must not silently mix duplicate or missing rows across pages.

## 2. Complete-access and pagination contract

### 2.1 Query behavior

- Authorization is evaluated from the authenticated account on the server. Tests use two ordinary accounts and prove that an ID, cursor, or filter from one account cannot expose the other account’s records.
- Search, filters, and sorting are applied before pagination. The normalized query/sort/filter contract is part of the client cache key and is bound to the cursor.
- Every ordered collection has a deterministic primary sort key and a unique immutable tie-breaker. Equal timestamps are an expected case, not an edge case.
- A cursor is opaque, versioned, and valid only for the sort direction and normalized query/filter state that created it. A changed query/filter/sort begins a new traversal.
- Responses report `nextCursor` only when more results exist and make completion explicit. A caller cannot infer completion merely from a short or empty partial page.
- Counts use database aggregates rather than materializing a whole collection solely to count it. AI retrieves bounded, relevant evidence rather than hydrating a whole library into a prompt.

### 2.2 Concurrent changes

Interactive lists are eventually consistent: an item created, changed, or removed while a user pages may appear or disappear on a later refresh. The UI deduplicates by stable ID and offers a refresh; it does not claim an immutable snapshot.

Exports and full synchronization have stronger semantics. They use a documented snapshot boundary or a reconciliation pass keyed by server revisions so that each record expected at that boundary is emitted exactly once. A lost page, failed request, expired cursor, or interrupted traversal makes the operation incomplete and user-visible; it cannot produce a “success” result.

## 3. Personal-evidence and citation identity contract

### 3.1 Typed evidence

Retrieval treats these as distinct evidence types:

- **Source segment:** an editorial passage from a content item.
- **Highlight:** the user’s stored selected text and optional note, with content/segment IDs and anchors.
- **Reflection:** the user’s prompt and reflection text attached to a content item.
- **User-authored note or saved synthesis:** a future compatible type; it is never silently conflated with source material.

The server enforces the requested scope and ownership for each item before ranking. Ranking considers the complete authorized candidate set before selecting bounded passages and surrounding context. Exact quotation requests return stored evidence text after this authorization step, not model-reconstructed text.

### 3.2 Citation identity and evidence changes

Each retrieved item receives a server-issued reference that is valid only for that response’s retrieved set. A rendered citation must resolve to a validated reference; model-invented or out-of-scope references are rejected.

A citation payload identifies, as applicable:

- evidence type and stable evidence ID;
- content and segment IDs plus reader anchor;
- the stored highlighted/reflection text or source excerpt used for the answer;
- a content/segment revision fingerprint or sufficient context snapshot; and
- one of `available`, `changed`, `withdrawn`, or `unavailable`.

For a changed source, the product identifies that the linked source has changed and preserves the stored personal evidence/context used for the answer. For withdrawn or inaccessible evidence, it explains the state and does not create a deceptive deep link. A full immutable editorial-history system remains deferred; this minimum representation prevents later history work from invalidating citations by design.

## 4. Evaluation and acceptance contract

Before changing retrieval behavior, create a versioned synthetic fixture set and record a baseline run. The fixture manifest contains case IDs, expected eligible evidence IDs, expected exact-quote text where applicable, distractors, and approved abstentions. The baseline record includes fixture version, application revision, model/provider configuration, date, and measured result.

The fixture set includes a large library, older highlights, reflections, conflicting user interpretation, identical timestamps, near-identical sources, missing/revoked evidence, a query whose decisive text is beyond the current clipping threshold, and two ordinary accounts.

Phase 1 acceptance requires all of the following:

- An export contains every expected record exactly once, including reflections, with per-collection counts matching the manifest.
- Pagination and full-traversal tests exceed the configured Data API response cap and include identical primary sort timestamps.
- Ownership tests use two ordinary accounts and prove no cross-account list, retrieval, cursor, or citation access.
- An interrupted traversal cannot report success, cannot emit a complete manifest, and leaves a recoverable failure state.
- Concurrent-change behavior is documented and tested for an interactive list and a completed export/synchronization traversal.
- Device A save → Device B sync → Device A remove → Device B reopen does not resurrect the bookmark.
- A network interruption leaves user knowledge pending or needing attention until recovery; it is never labeled synced prematurely.
- Citations resolve only to allowed evidence and explicitly handle changed, withdrawn, and unavailable evidence.
- Retrieval metrics are compared with the recorded baseline: eligible-evidence recall, exact-quote fidelity, citation validity, irrelevant-source rejection, and correct abstention.
- The required ordinary-user production-build journey cannot silently skip: capture → later session → retrieve → open evidence → export/reconcile.

## 5. Finding register

The owner column assigns an accountable role only. A named owner and target date must replace it before the corresponding work starts.

| # | Workstream / timing | Accountable role | Dependency or release gate | Acceptance evidence |
| --- | --- | --- | --- | --- |
| 1 | Immediate claim correction; later validation | Product | Do not rely on unsupported exclusivity claims | Public claims are qualified; comparative task study is defined. |
| 2 | Core retrieval: reliable search | Engineering | Complete-access contract | Old matching notes appear without loading earlier pages. |
| 3 | Core retrieval: typed evidence | Engineering | Evidence-identity contract | Library answers retrieve owned highlights/notes and distinguish them from sources. |
| 4 | Core retrieval: typed evidence | Engineering | #3 contract | Reflection-only and mixed scopes retrieve only allowed records. |
| 5 | Core retrieval: citations | Engineering | #3 and evidence-identity contract | Every citation validates and opens exact allowed evidence. |
| 6 | Core retrieval: ranking | Engineering | #3 contract | Relevant evidence outside initial client candidates remains eligible. |
| 7 | Core retrieval: complete access | Engineering | Lifecycle and pagination contracts | Over-cap account remains complete with accurate counts. |
| 8 | Durability alongside Phase 1 | Engineering | Lifecycle contract | A stale second device cannot resurrect a removed bookmark. |
| 9 | Durability alongside Phase 1 | Engineering | #8 mutation semantics | Interrupted writes are visible, durable, and recoverable. |
| 10 | Core retrieval plus durability | Engineering | Lifecycle and pagination contracts | Versioned export includes every inventory record exactly once. |
| 11 | Pre-implementation contract | Product, Privacy, Engineering | None | Owned-data inventory and control wording are approved and tested. |
| 12 | Core retrieval: reliable search | Engineering | Search/pagination contract | Concept search returns relevant snippets in relevance order. |
| 13 | Core retrieval: reliable search | Engineering | Search error contract | Backend failure is retryable, not a successful zero result. |
| 14 | After core correctness | Product | #29 outcome measurement | Revisit pilot shows measured useful recovery. |
| 15 | After core correctness | Product, Engineering | Evidence/citation contract | Explicitly saved synthesis is later retrievable with sources. |
| 16 | After core correctness | Product | #14–#15 pilot design | Optional demo task measures capture then recovery. |
| 17 | Before expanded publishing | Content operations | #18 minimum contract | Provenance checklist and correction process are recorded. |
| 18 | Pre-implementation minimum; broader work later | Content operations, Engineering | Evidence-identity contract | Changed source opens with preserved context and clear state. |
| 19 | Release gate for publishing | Content operations, Engineering | Before new/materially edited content is relied on in AI | Indexing state, age target, failure path, and owner are visible. |
| 20 | Alongside Phase 1: AI safeguards | Engineering | Trusted identity and quota design | Concurrent requests cannot exceed the final quota unit. |
| 21 | Alongside Phase 1: AI safeguards | Platform engineering | Hosted proxy/header verification | Per-account and abuse buckets are consistent across AI routes. |
| 22 | Alongside Phase 1: AI safeguards | Engineering, Operations | #20 reservation model | Global/guest budget, kill switch, and measured cost controls work. |
| 23 | Alongside Phase 1: mutation boundary | Engineering, Security | Lifecycle contract | Every write path is inventoried and bounded at an authoritative layer. |
| 24 | Alongside Phase 1: graceful failure | Engineering | Retrieval contract | Timeouts, cancellation, and degraded evidence behavior are tested. |
| 25 | Pre-implementation baseline; ongoing proof | QA, Engineering | Evaluation contract | Versioned corpus and recorded benchmark are maintained. |
| 26 | Alongside Phase 1: journey proof | QA, Engineering | Fixture set | Required ordinary-user production-build journey passes without skips. |
| 27 | Release gate for changed interactions | QA, Engineering | Citation/notes UI changes | WebKit, keyboard, screen-reader, and text-size checks pass. |
| 28 | Release gate before launch spike | Platform engineering | Expected-load envelope | Staging workload meets recorded latency, success, and cost targets. |
| 29 | Alongside Phase 1: measurement | Product analytics | #25 event definitions | Capture-to-retrieval and return cohorts are measured without raw text. |
| 30 | Operational readiness | Security, Operations | Applicable production authorization | Read-only Auth/recovery review has current signed-off evidence. |
| 31 | Operational readiness | Operations | Current backup posture | Isolated restore meets approved RTO and verifies Storage behavior. |
| 32 | Operational readiness | Operations | Alert ownership | Alert delivery through acknowledgement and response ownership are proven. |

## Implementation order

After approval, start #7 with the access contract and shared acceptance fixtures. Continue with #2/#12/#13, then #3/#4/#6, then #5. #8/#9 and #10 proceed as the durability track using the approved lifecycle contract. #20–#24, #25–#26/#29, and #30–#32 are parallel work with their own gates; none should quietly become a dependency of the first pagination change unless its acceptance evidence directly requires it.

No finding is considered resolved merely because a related change ships. The register’s acceptance evidence, release gate, or reconsideration trigger is the closure criterion.
