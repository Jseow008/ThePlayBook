# Netflux blind-spot audit

Date: 8 September 2026

Baseline: freshly fetched `origin/main`, commit `7920a97`

Scope: product promise, discovery, reading, capture, retrieval, backend safeguards, scalability, reliability, measurement, and operations.

## What matters most

Netflux already has a substantial foundation. The biggest remaining risk is that a user can consume and save knowledge successfully, yet fail to recover the particular idea they need later. Several boundaries between otherwise working features weaken the central promise: search versus pagination, summaries versus personal highlights, notes versus reflections, and local state versus cross-device state.

The first work should close those gaps and prove the complete journey. Payments are intentionally excluded. A bigger catalog, a new design, and more AI surfaces would not resolve the most important findings below.

This is a broad code and documentation audit, supplemented by current first-party competitor information. It is not a production penetration test, browser usability study, live database audit, or traffic benchmark. “Confirmed” means the implementation path is visible in the audited commit; it does not mean the scenario was reproduced against production. No production settings or application code were changed. No audit can prove that every blind spot has been found.

### Reading the findings

- **P1:** Address before materially expanding usage or relying on the affected product promise.
- **P2:** Schedule after the core correctness work, or bring forward when the stated trigger occurs.
- **Confirmed:** Direct implementation evidence.
- **Opportunity:** A product hypothesis to validate, rather than an established defect.
- **Verification gap:** Evidence or operational proof is missing; the control may exist outside the repository.
- **Known follow-up:** Already recorded in project documentation. These are unfinished work, not newly discovered omissions.

### Recommended first sequence

| Order | Work package | Findings | Outcome to demonstrate |
| --- | --- | --- | --- |
| 1 | Make old ideas discoverable | 2–7, 12–13 | A matching old note is found without loading every page; a quoted answer opens the exact saved passage. |
| 2 | Protect users' accumulated work | 8–11 | Removing a bookmark stays removed across devices; sync failures are visible; exports contain all owned knowledge. |
| 3 | Make AI limits enforceable | 20–24 | Concurrent requests respect quotas; cost and outage behavior remain bounded. |
| 4 | Prove the promised journey | 25–29 | A real authenticated reader saves, returns, retrieves, and uses an idea, with observable outcomes. |
| 5 | Close existing operational gates | 30–32 | Auth settings, restoration, and monitoring have current evidence and an accountable owner. |
| 6 | Strengthen the reason to return | 1, 14–19 | Netflux demonstrates a specific advantage through a coherent learning and retrieval experience. |

Some work packages can proceed in parallel. These are recommendations for future work, not authorization to change production databases or settings.

## Product promise and retrieval

### 1. The competitive differentiation needs current evidence

**P1 · Confirmed positioning mismatch; proposed advantage remains a hypothesis.**

[POSITIONING.md](./POSITIONING.md#L1) describes Netflux as the only combination of readable knowledge across formats, persistent capture, and cross-library retrieval. That exclusivity claim is no longer defensible from the current competitor evidence:

- Readwise's 7 August 2026 changelog describes Global Ghostreader searching across saved documents and answering with citations linking to sources. Its separate highlights product also supports AI chat and review workflows. [Readwise changelog](https://docs.readwise.io/changelog#august-7-2026), [Chat With Highlights](https://docs.readwise.io/readwise/guides/chat-with-highlights).
- Deepstash's developer-authored App Store description advertises saved idea collections, personalized feeds, reading history, and offline library access in Pro. This is a feature claim, not an independent quality assessment. [Deepstash App Store listing](https://apps.apple.com/us/app/deepstash-smarter-every-day/id1445023295).
- Shortform advertises interactive exercises, highlights, notes, and deeper guides. Describing it solely as faster consumption understates its offer. [Shortform](https://www.shortform.com/).

**Next step:** Replace absolute competitor claims with a testable advantage: for a specific audience and task, can Netflux move someone from a curated explanation to their own saved evidence and a useful decision with less effort? Compare the same task across products. Preserve the summary-first thesis; establish its benefit rather than relying on feature exclusivity.

### 2. Notes search can miss an old idea that exists

**P1 · Confirmed.**

The notes page initially loads 30 highlights. Search, type/color/source filters, and oldest/newest sorting run over the highlights already loaded in the browser. They do not search the complete stored collection. A match on a later page can therefore be absent from the displayed results, precisely when someone is trying to find an old idea. Pagination itself already exists and is useful; its interaction with search is the gap. [Initial query](../app/(public)/notes/page.tsx#L32), [pagination hook](../hooks/useHighlights.ts#L75), [client filtering](../app/(public)/notes/client-page.tsx#L1044).

**Next step:** Apply search, filters, and stable sorting on the server before pagination. Include the query in the cache key. Prove that a match beyond the first page appears immediately, including when sorting oldest first.

### 3. Ask My Library does not retrieve the user's actual highlights or commentary

**P1 · Confirmed.**

The route fetches `user_library` metadata and relevant summary segments. It does not fetch `user_highlights`, their `note_body`, or reflections. That supports questions about saved content, but cannot reliably fulfill the flagship example of returning the exact passage the user highlighted years ago, or explain why the user personally saved it. [Library context and retrieval](../app/api/chat/route.ts#L463), [segment context construction](../app/api/chat/route.ts#L228), [demo promise](./POSITIONING.md#L1).

**Next step:** Retrieve owned highlights, notes, and reflections alongside summary context, with explicit source types. Distinguish “the summary says” from “you highlighted” and “you wrote.” Verify a case where a user's note disagrees with the source, so the system does not conflate them.

### 4. Reflections are saved but disconnected from Ask These Notes

**P1 · Confirmed.**

Reflections already have persistence, editing, deletion, and display in the notes experience. However, `notesChatScope` includes only `filteredHighlights`. Selecting the reflection type leaves no reflection IDs for the assistant to retrieve. The server likewise fetches only highlights. This makes a newer capture feature unavailable to the existing synthesis workflow. [Reflection filtering](../app/(public)/notes/client-page.tsx#L1073), [assistant scope](../app/(public)/notes/client-page.tsx#L1240), [server context](../app/api/chat/notes/route.ts#L214), [reflection hooks](../hooks/useReflections.ts#L1).

**Next step:** Give the scope a typed set of highlight/note/reflection references, enforce ownership for each type, and test reflection-only and mixed scopes. Show users what the assistant can actually see.

### 5. AI source mentions are not a verified path back to the exact evidence

**P1 · Confirmed.**

Library retrieval formats source titles and text into the prompt; Notes asks the model to cite titles naturally. Neither path supplies a structured, validated citation contract tying each answer reference to an owned highlight, segment, and reader anchor. The notes UI already supports highlight deep links, so part of the destination mechanism exists. [Library source formatting](../app/api/chat/route.ts#L251), [Notes citation instruction](../app/api/chat/notes/route.ts#L270), [notes deep-link behavior](./DESIGN.md#L1).

**Next step:** Return structured source metadata alongside the answer, validate cited IDs against the retrieved set, and render links to the precise passage. For “exact quote” requests, serve the stored text directly rather than trusting model reconstruction. Include edited and unavailable-source cases.

### 6. Context limits can remove the relevant evidence before the model sees it

**P1 · Confirmed.**

Ask These Notes takes the first 40 filtered highlights before server relevance ranking. The context formatter then shortens highlights to 160 characters when a note exists or 220 otherwise. Ranking considers fuller text, but the answer can still lose the useful sentence later in a selected highlight. Existing scope counts and context-budget disclosures are good safeguards; they do not fix candidate exclusion or clipping. [40-item selection](../app/(public)/notes/client-page.tsx#L1240), [highlight clipping](../lib/server/notes-chat-context.ts#L39), [ranking and omission handling](../app/api/chat/notes/route.ts#L234).

**Next step:** Rank across the authorized filtered collection before selecting a bounded context. Select relevant spans with surrounding context, and fetch a full highlight for exact-quotation requests. Verify a decisive sentence after character 220 and a relevant note outside the first 40 candidates.

### 7. Large personal libraries can silently become partial libraries

**P1 before heavy users · Confirmed unpaginated paths; live threshold unverified.**

Library hydration, Ask My Library metadata, and reflection listing each use a single unpaginated query. The repository's local Data API setting caps responses at 1,000 rows. The production cap was not checked. At the applicable cap, inventory answers, synchronization, and reflection visibility can become incomplete without an explicit “partial” result. [Hydration query](../hooks/useReadingProgress.ts#L355), [Ask metadata](../app/api/chat/route.ts#L463), [reflection listing](../app/api/library/reflections/route.ts#L33), [local response cap](../supabase/config.toml#L18).

**Next step:** Use paginated synchronization and reflection listing, plus database aggregates for library counts. Retrieve only the metadata needed for a question instead of putting a whole library into a prompt. Test above the configured row cap; do not fix this by simply raising the cap indefinitely.

## Persistence and user control

### 8. A removed bookmark can return from another device

**P1 · Confirmed merge behavior; two-device reproduction still needed.**

Hydration merges a local bookmark with the cloud using `localHasBookmark || cloudIsBookmarked`. If device A removes an item while device B retains its old local saved list, B's hydration can write `is_bookmarked: true` back to the cloud. Progress has a freshness comparison, but bookmark removal has no equivalent conflict rule in this merge. [Merge and writeback](../hooks/useReadingProgress.ts#L375), [upsert contract](../lib/server/user-library-repository.ts#L29).

**Next step:** Represent bookmark changes with a version or server timestamp and preserve removals through an explicit deletion marker or mutation record. Prove save on A → sync B → remove on A → reopen B does not resurrect the save.

### 9. Local persistence needs an explicit pending-sync contract

**P1 · Confirmed.**

Guest storage scoping, guest-to-account migration, and cloud reconciliation already exist. Cloud writes can fail and return `false`, with errors logged; several local actions initiate synchronization without awaiting a user-visible result. Hydration may recover later, but the user cannot reliably distinguish “saved on this browser” from “safely synced.” [Cloud write failure handling](../hooks/useReadingProgress.ts#L245), [hydration recovery](../hooks/useReadingProgress.ts#L431), [local save actions](../hooks/useReadingProgress.ts#L640).

**Next step:** Add a small durable mutation queue, retry on reconnection, and expose pending/failed/synced status for user knowledge. Define conflict behavior before adding broad offline functionality. Verify a network interruption followed by a reload and a second-device read.

### 10. Download My Data is incomplete for the current product

**P1 · Confirmed.**

Export exists and checks query failures, but fetches only library, activity, feedback, and highlights in four unpaginated queries. It omits reflections and other newer owned records, such as request-board participation and notification preferences. A sufficiently large table can also be truncated by the Data API cap while the UI says the export is complete. [Export implementation](../app/(public)/settings/page.tsx#L103), [reflection data](../app/api/library/reflections/route.ts#L33).

**Next step:** Define a versioned export inventory, paginate every collection, include source identifiers/context needed to interpret entries, and report counts. Verify an account with reflections and more than one page of each major record type. A portable Markdown option would be useful later; completeness comes first.

### 11. Deletion and history controls need one clear data inventory

**P2 · Confirmed UI/data mismatch; operational deletion process unverified.**

“Clear Reading History & Library” deletes `user_library` and browser caches, but does not delete `reading_activity`. Notes/highlights have a separate bulk-delete control, while reflections use individual deletion. The privacy page offers account deletion by contact, but no end-to-end account-deletion handler or runbook was identified in the audited paths. This is not evidence that contact requests are ignored. [History clearing](../app/(public)/settings/page.tsx#L193), [control wording](../app/(public)/settings/page.tsx#L432), [contact-based deletion](../app/(public)/privacy/page.tsx#L194).

**Next step:** Decide exactly what each control removes and align its wording. Document account deletion across database records, analytics identifiers, active sessions, and any retained suppression records. An owned manual process is sufficient initially; self-service deletion need not precede a reliable process. Verify with a synthetic account.

## Discovery and returning value

### 12. Catalog discovery understands titles better than ideas

**P2 · Confirmed.**

Public search matches title, author, and category, then orders matches by creation time. It does not search summary bodies or segment concepts. A user who remembers “loss aversion” but not the source title may find nothing even when the catalog contains the idea. Existing filters, escaped search terms, and pagination should be retained. [Catalog query](../app/(public)/search/search-components.tsx#L249).

**Next step:** Start with indexed full-text search over selected summary/segment text, relevance ordering, and snippets showing why a result matched. Evaluate exact terms, paraphrases, misspellings, and author names before adding another AI dependency.

### 13. A failed catalog query can look like no matching content

**P1 · Confirmed.**

The search query destructures `data` and `count` without handling `error`, then uses an empty list when data is absent. A database failure can therefore produce a normal empty result rather than a retryable error. This can also contaminate no-result analytics. [Search result handling](../app/(public)/search/search-components.tsx#L274).

**Next step:** Separate successful zero results from query failure, preserve the query/filter state, provide retry, and emit an operational error rather than a successful zero-result search. Verify both responses with controlled failures.

### 14. Returning to saved knowledge is still largely self-directed

**P2 · Opportunity grounded in current flow.**

Browse emphasizes featured content, new additions, editorial lanes, and recommendations. Saved lists, reading history, notes, and reflections exist, but no review schedule or saved-idea resurfacing state was identified in the audited model. Users must remember to return to the knowledge they wanted help remembering. [Browse composition](../components/ui/HomeFeed.tsx#L34), [current data model](../types/database.ts), [retention thesis](./POSITIONING.md#L1).

**Next step:** Test a lightweight “revisit one saved idea” experience in the existing workspace, with dismiss/snooze controls. Measure whether people recover something useful. Do not assume streaks, push notifications, a spaced-repetition algorithm, or new browse sections are required.

### 15. Connections made in chat need a durable destination

**P2 · Opportunity.**

The product can produce cross-source synthesis and offers chat exports. Notes chat session state uses browser `sessionStorage`, while transfer exports expire after 30 minutes. Those are useful transport/session mechanisms, but they are not a saved, searchable personal synthesis linked to its evidence. Reflections already provide a useful storage pattern to extend. [Notes session persistence](../lib/notes-chat-session.ts#L36), [export lifetime](../lib/chat-export.ts#L1), [reflection hooks](../hooks/useReflections.ts#L1).

**Next step:** Let a user explicitly save a useful answer or connection as their own note with references and an optional “how I will use this” field. Test later retrieval of that saved synthesis. Avoid automatically filling the library with every AI response.

### 16. Onboarding completion does not establish the demo moment

**P2 · Opportunity.**

A welcome activation flow and product tour already exist. Completing the walkthrough records completion and routes the user onward; it does not establish that they have saved an idea and recovered it through retrieval. A user can understand the navigation while still missing the reason Netflux matters. [Welcome activation](../components/ui/WelcomeActivation.tsx#L1), [tour content](../lib/onboarding.ts#L25).

**Next step:** Offer one optional real task using the user's chosen content: read a passage, capture why it matters, then find it again. Track that separately from tour completion. Preserve the existing layout and visual system; this is a behavior experiment, not a redesign recommendation.

## Content trust and publishing

### 17. “Verified” validates content shape more clearly than editorial evidence

**P2 · Confirmed validation scope; editorial process outside code unverified.**

Publish validation requires a cover, category, valid quick-mode fields, and a nonempty segment. Source URL is optional in the update schema. These are appropriate structural checks, but do not record who checked a summary against which source edition, when it was checked, or how a material correction should be communicated. No conclusion about actual summary accuracy follows from this. [Publish validation](../lib/server/admin-content-publish.ts#L26), [source field schema](../app/api/admin/content/[id]/route.ts#L244).

**Next step:** Define a modest editorial checklist and provenance record: source, edition/date or timestamp where applicable, reviewer, review date, and correction status. Make source context available from the reader. Separate quotation, paraphrase, and Netflux interpretation where users need to judge evidence.

### 18. Preserving highlight rows is not the same as preserving historical meaning

**P2 · Known follow-up with direct product relevance.**

DB-002 already protects highlighted segments from destructive replacement/removal. That should not be relabeled as missing protection. The remaining question is what happens to the meaning and original context of a saved passage after substantial in-place edits. Immutable revisions, audit history, rollback, and JSON versioning remain undecided under DB-202. [Completed preservation work](./DATABASE_PRODUCTION_READINESS.md#L302), [revision decisions](./DATABASE_PRODUCTION_READINESS.md#L827).

**Next step:** Preserve a source revision reference or sufficient context snapshot for saved knowledge, and define correction/withdrawal behavior. Test opening an old highlight after a rewrite. A full revision system is only justified when this concrete requirement needs it.

### 19. Publishing and being searchable by AI are separate operational states

**P1 for content publishing · Confirmed; manual workflow is intentional.**

The admin has embedding coverage indicators, invalidation, and sync utilities. Segment backfill intentionally runs from a trusted local machine. The operational instruction is to publish/edit, sync, and check coverage. The blind spot is a user-visible interval where content is readable but missing from retrieval, or a missed manual follow-up; it is not an absence of embedding tooling. [Embedding operations](./OPS.md#L302), [local sync contract](../lib/server/gemini-segment-sync.ts#L1), [admin update invalidation](../app/api/admin/content/[id]/route.ts#L604).

**Next step:** Make “published but retrieval pending/failed” explicit and track its age. Define an acceptable indexing delay and a recovery owner. Automate a versioned, idempotent indexing job only if the manual process cannot meet that target. Verify retrieval after both a new publish and a material edit.

## Backend limits, cost, and graceful failure

### 20. AI usage quotas are checked and recorded separately

**P1 · Confirmed race condition in the enforcement design.**

Daily, weekly, and monthly counts are queried, generation proceeds, and usage is inserted in `onFinish`. Two simultaneous requests near a limit can both pass before either records usage. A failed usage insert is logged after generation rather than preventing further spend. Existing persistent quotas and output caps are valuable, but this is not an atomic admission decision. [Quota checks and insert](../lib/server/ai-usage-quota.ts#L117), [post-generation accounting](../app/api/chat/route.ts#L569).

**Next step:** Reserve quota atomically before generation with an idempotent request ID, then settle or release the reservation under an explicit cancellation/failure policy. Add a per-user concurrent-generation limit. Verify parallel requests with exactly one unit remaining.

### 21. Rate-limit identity is inconsistent across AI routes

**P1 · Confirmed bucket behavior; header spoofing depends on deployment.**

The shared limiter defaults to `pathname + key + IP`. Library and Notes pass a user ID as `key` but do not override `identifier`, so their burst bucket still changes with IP. Author Chat correctly supplies `identifier: user.id` for authenticated requests. The IP helper also prefers `cf-connecting-ip`; whether an incoming value is trustworthy depends on the actual proxy configuration, which was not verified here. [Bucket construction](../lib/server/rate-limit.ts#L54), [Library call](../app/api/chat/route.ts#L319), [Notes call](../app/api/chat/notes/route.ts#L95), [Author call](../app/api/chat/author/route.ts#L194).

**Next step:** Standardize a per-account bucket plus an independent abuse/IP bucket. Verify which headers the deployed edge overwrites and reject untrusted identity inputs. Test IP changes, shared networks, and cross-route concurrency. Do not describe header spoofing as a demonstrated production exploit.

### 22. Message counts do not bound the total AI bill

**P1 before promotion · Confirmed design gap; actual spend unmeasured.**

Guest Author Chat has a burst limiter but no authenticated durable quota. Many accounts or guest identities can each remain inside individual limits. Notes relevance ranking also re-embeds the query and all candidate note texts on each request, increasing repeated work even for unchanged notes. No application-wide cost admission budget was identified in these paths. [Guest limiter](../app/api/chat/author/route.ts#L194), [authenticated quota branch](../app/api/chat/author/route.ts#L305), [per-request embedding batch](../lib/server/notes-chat-context.ts#L200).

**Next step:** Define a daily global spend/concurrency ceiling and a restricted guest trial budget, with an operator kill switch and graceful user messaging. Measure tokens, embedding volume, and cost per useful retrieval. Cache or persist note embeddings by content hash/version while maintaining ownership boundaries. This does not require Stripe.

### 23. API route limits do not cover every database write path

**P2 · Confirmed architecture boundary; not an authorization-bypass finding.**

The bookmarks API is rate-limited, but `useReadingProgress` also calls the browser Supabase client through the repository helper. Those direct database writes do not pass through the Next.js route limiter. RLS still controls row access; it does not establish a request-rate budget. [API limiter](../app/api/library/bookmarks/route.ts#L22), [direct cloud upsert](../hooks/useReadingProgress.ts#L299), [repository write](../lib/server/user-library-repository.ts#L29).

**Next step:** Inventory public and authenticated mutation paths, including direct RPC/Data API access. For writes requiring abuse or resource limits, enforce them at the lowest reachable boundary or narrow the direct privileges and route the mutation through controlled server code. Reuse existing RLS and constraints; do not assume moving a UI call alone closes the path.

### 24. Provider selection is not runtime outage recovery

**P2 · Confirmed application behavior.**

Ask My Library returns an error when Gemini embedding retrieval fails. Generation chooses Anthropic/OpenAI based on configuration, but the shown route does not implement a second-provider handoff after an active provider fails. SDK defaults may provide retries; that is different from an application-level deadline and degradation policy. Notes already has a useful fallback from embedding ranking to scope order. [Retrieval failure](../app/api/chat/route.ts#L500), [provider selection](../app/api/chat/route.ts#L556), [Notes fallback](../app/api/chat/notes/route.ts#L239).

**Next step:** Set explicit stage deadlines and cancellation behavior. Where appropriate, fall back to lexical source retrieval or display matching passages without generation. Only add generation-provider failover if needed, and prevent duplicate charges or mixed partial answers. Test retrieval failure, provider throttling, stream interruption, and a user cancelling.

## Evidence that the product works

### 25. Retrieval tests need a quality benchmark in addition to route correctness

**P1 for the USP · Verification gap.**

There are substantial chat route and context unit tests. No maintained end-to-end retrieval-quality benchmark was identified in the audited tests: expected passages for representative questions, exact-highlight recovery, citation validity, irrelevant-source rejection, or useful abstention. Passing a mocked route test does not establish that the intended idea is recovered from a real corpus. [Chat tests](../tests/api/chat.test.ts), [Notes tests](../tests/api/notes-chat.test.ts), [context tests](../app/api/chat/notes/route.test.ts).

**Next step:** Create a small synthetic corpus with known answers and distractors. Include old highlights, reflections, conflicting notes, near-identical sources, out-of-library questions, instructions embedded in source text, and revoked/deleted evidence. Measure source recall, quote fidelity, citation validity, and refusal/abstention correctness. Keep model evaluations bounded and separate from fast deterministic tests.

### 26. CI does not yet prove the complete authenticated production journey

**P1 · Confirmed workflow gap.**

CI builds the app and runs Playwright, but Playwright's default server command is `npm run dev`. The principal critical journey ends at reader controls. Some authenticated suites skip when credentials are absent; the shown CI environment does not provide those credentials. A library test even checks only that the page body is visible. Other tests provide useful coverage, but these gates do not prove save → sign out → return → retrieve → open exact evidence against the built application. [CI](../.github/workflows/ci.yml), [Playwright server](../playwright.config.ts), [critical journey](../tests/e2e/critical-journey.spec.ts#L4), [authenticated skip](../tests/e2e/responsive-authenticated.spec.ts#L32), [library tests](../tests/e2e/library.spec.ts).

**Next step:** Seed disposable ordinary users and known content, run one required critical journey against `next start`, and fail that gate if required fixtures are missing. Keep admin-role tests separate from ordinary-user behavior. Include sign-in return URLs, guest migration, persistent capture, retrieval, and second-session verification.

### 27. Mobile viewport testing does not establish Safari behavior or accessibility

**P2 · Confirmed test configuration; no specific accessibility defect asserted.**

The suite covers multiple screen sizes and reduced motion, which is a strong baseline. All configured browser projects use Chromium, including iPhone/iPad device profiles. That does not exercise WebKit selection, mobile audio, keyboard/viewport behavior, or assistive-technology interactions. [Browser projects](../playwright.config.ts), [reduced-motion tests](../tests/e2e/reduced-motion.spec.ts).

**Next step:** Add a small WebKit critical-path suite and a real-device spot check of highlight selection, note editing, audio seeking, and keyboard overlays. Review keyboard-only and screen-reader flows for the accordion, dialogs, notes filters, and citation links. Check text enlargement as well as screen width. Expand tests around demonstrated risks, not every device permutation.

### 28. Capacity targets and a realistic workload are still missing proof

**P1 before a launch spike · Known follow-up / verification gap.**

The project has already fixed important RLS, vector-index, foreign-key-index, and invariant issues. Expected launch traffic testing remains unchecked under DB-203. Realistic load includes long personal histories, cold caches, parallel saves, AI retrieval, public media egress, and queued work—not just a fast empty database or cached browse response. [Completed hardening and remaining load criterion](./DATABASE_PRODUCTION_READINESS.md#L844), [hydration workload](../hooks/useReadingProgress.ts#L355).

**Next step:** Define the expected launch envelope with the owner, then test it using synthetic data in staging. Record browse/read/search p95 latency, write success, retrieval latency, DB connections/lock waits, queue age, and cost. Investigate query plans and bounded batching where measurements show pressure. Do not preemptively shard the database or rewrite the architecture.

### 29. Current analytics measure activity more clearly than recovered value

**P1 for product decisions · Confirmed event-contract gap.**

Typed events, privacy allowlists, server-confirmed mutations, and dashboards already exist. The contract measures opens, completions, saves, highlights, reflections, searches, and chat starts. It does not record successful old-idea recovery, citation opening, or a user marking an answer useful/applied. Dashboard engagement uses pageviews and event volume; this does not prove the positioning's seven-day return hypothesis or knowledge usefulness. [Event contract](../lib/analytics-events.ts#L55), [engagement dashboards](../config/posthog/netflux-dashboard-spec.mjs#L188), [positioning metric](./POSITIONING.md#L1).

**Next step:** Define activation as a meaningful capture followed by successful retrieval, then track seven- and thirty-day return cohorts after capture. Add metadata-only events for source opened, answer useful/not useful, and saved idea revisited, including age buckets. Separate content consumption from reuse. Preserve the current protections against logging raw prompts and note text. Validate instrument accuracy before interpreting a small cohort as product-market evidence.

## Existing operational follow-ups that should remain visible

### 30. Production Auth and account recovery controls need current sign-off

**P1 · Known follow-up; not a newly discovered vulnerability.**

DB-107 remains in progress for leaked-password protection, password policy, email confirmation/OTP/redirect/SMTP verification, organization MFA/recovery ownership, SSL/network controls, and connection choices. Supabase Pro was already verified on 25 August; treating an old “requires upgrade” note as the current blocker would be misleading. [DB-107](./DATABASE_PRODUCTION_READINESS.md#L767), [current readiness position](./DATABASE_PRODUCTION_READINESS.md#L980).

**Next step:** Perform a read-only production settings review, distinguish controls relevant to public passwordless users from password-authenticated admins, and record evidence and owners. Apply settings changes only through the appropriate authorized release process. Local `config.toml` values do not prove the hosted configuration.

### 31. Pro backups exist; restoration under the current posture still needs proof

**P1 · Known follow-up.**

The repository records seven completed daily Pro backups, independent Storage verification, recovery targets, and a prior local restore drill. The remaining DB-003 proof is restoring from the current Pro backup posture within the approved four-hour RTO. PITR and recurring independent Storage copies are deliberately deferred and are not being counted as blind spots. [DB-003](./DATABASE_PRODUCTION_READINESS.md#L390).

**Next step:** Run the already-required isolated restore exercise and record elapsed recovery time, app usability, Auth behavior, and Storage-object availability. Keep destructive Storage cleanup conditional on the existing recovery policy: database backups contain Storage metadata, not the object bytes. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

### 32. Monitoring needs proof that someone receives and acts on failure

**P1 · Known follow-up plus confirmed health-check scope.**

Sentry, request IDs, security telemetry, health checks, database monitoring work, and worker retry mechanisms already exist. Runtime readiness marks AI and Redis as ready largely from environment-variable presence; this is not proof that those dependencies currently work. DB-203 still calls for billing-recipient/Spend Cap verification, queue freshness/backlog signals, capacity oversight, and alert delivery. Narration relies on an immediate background handoff with manual recovery unless an external scheduler is configured; request notifications and story images already have scheduled recovery workflows. [Runtime readiness](../lib/server/health.ts#L45), [DB-203](./DATABASE_PRODUCTION_READINESS.md#L844), [narration operations](./OPS.md#L336), [notification scheduler](../.github/workflows/process-request-notifications.yml), [story-image scheduler](../.github/workflows/process-story-images.yml).

**Next step:** Complete the practical monitoring baseline already chosen: verify the recipient, test one alert through to acknowledgement, document response ownership, and check queue age and backup freshness. Add a cheap isolated critical-path probe where justified. Treat advanced telemetry automation and a new scheduler as explicit architecture decisions; the accepted deferral is not itself a defect.

## What should not be mistaken for missing foundations

- Stripe, subscriptions, and monetization were intentionally deferred by the owner.
- Production rate limiting, authenticated AI quotas, context/output caps, and payload validation already exist. Findings 20–23 concern their boundaries and accounting.
- RLS, admin role checks, public RPC hardening, index corrections, core constraints, protected main, and deployment checks have substantial implementation and recorded verification. Do not repeat those projects without a regression.
- Highlights, annotations, reflections, guest migration, settings, onboarding, request-board notifications, audio, exports, and content feedback exist. The report focuses on where they fail to compose into the promised outcome.
- Supabase Pro and daily backups are already recorded. PITR, recurring independent copies, and advanced monitoring automation have explicit deferrals; preserve those decisions unless their stated reconsideration trigger is reached.
- Native apps, a full offline library, social features, a knowledge graph visualization, user uploads/imports, a new design system, and a much larger catalog may be useful options. Their absence alone is not a blind spot. Validate user demand and the operational cost before expanding scope.

## Acceptance scenario for the next phase

Use a synthetic ordinary account with more than 1,000 saved records, at least 100 highlights, several reflections, and known source revisions. Save a precise passage and an interpretation that differs from the source. On another session, search for an older idea, ask for the user's actual interpretation, open the cited highlight, and save a useful synthesis. Remove a bookmark from one device and verify that another device does not restore it. Export the account and reconcile record counts.

Repeat the relevant steps with a disconnected client, a failed database query, unavailable embeddings, interrupted generation, and simultaneous requests at a quota boundary. Verify that the app preserves knowledge, describes the failure accurately, respects resource limits, and produces the intended monitoring and product events. Use disposable infrastructure and synthetic data; these are proposed future acceptance checks, not tests run during this documentation audit.

Success is a user being able to trust Netflux with an idea today and recover the correct evidence when it matters later. That is the most useful organizing principle for choosing which of these findings to implement first.
