# Netflux release and workstream status

## Bounded Search outcome measurement — 10 October 2026

Branch `codex/search-outcome-measurement` starts from `origin/main` at
`87aca121`. PR #269 merged with PR scope, validate, Security Validation,
Catalog Search Evidence, and Vercel checks passing. Browse recovery and the
controlled 202/429/conflict paths are verified within their recorded scope;
the historical recurring conflict and original live failure cause stay open.
The hosted gate for that release occurred retrospectively.

**One journey:** submit a catalog query or change a Search filter, then reach
clickable results or an explicit empty/error state. **Primary outcome:** time
from the action to the rendered outcome, reported separately for query and
filter actions and for in-app versus document navigation. A result click is an
intent signal; it does not by itself prove relevance. **Hypothesis:** topic
filter changes with an active query take longer than plain query submissions,
because category stats currently resolve before those filtered searches start.
No rendering optimization is authorized from historical browser timings alone.

PostHog project 450488, last 30 days at 2026-10-09 17:25 UTC: 65
`search_performed` events on `/search` across five people; 57 unfiltered and
eight filtered. Person-property segmentation finds 19 events marked internal,
27 marked noninternal from one person, and 19 without an internal label.
Those groups overlap in people and are not a representative external cohort.
Existing events fire only after results render, do not record the action start
or readiness time, and do not distinguish filter changes from a query with a
filter. `search_failed` was not seen in the last 30 days. This is a coverage
baseline, **not** a latency or relevance baseline.

The branch adds action and settled timing events without raw query text,
plus result-click intent, while preserving normal Search layout, ordering,
cache behavior, and result logic. Unqueried catalog read failures now show an
error instead of being mislabeled as empty results. Before any later rendering experiment, use
only known noninternal traffic for the field baseline; report anonymous or
unclassified traffic separately. Require at least 30 settled actions from at
least 10 noninternal people in each compared action group; otherwise the
comparison is inconclusive. Stop the baseline collection at 14 days after
release, even if the sample is insufficient. A later experiment must hold
Search failures and zero-result behavior to the matched baseline and must not
regress primary p75 action-to-outcome time by more than 20%. Live
publish/withdrawal freshness remains unverified and requires its own check.

A read-only PostHog count found 124 earlier Search outcome events whose
automatically attached `$current_url` contained `?q=`. No query values were
retrieved. The branch overrides that property for future Search events; the
historical events remain in PostHog and are outside this measurement PR.

Local evidence: focused typecheck, lint, and 50 Search/analytics component and
unit tests pass. Search route desktop and mobile responsive checks pass with
only public Supabase settings. One local browser setup initially lacked those
settings; it made no valid UI assertion. A focused PostHog browser check then
exposed a Strict Mode effect restart that canceled the paint timer; the guard
was corrected and the same query-to-filter event check passed. This check uses
intercepted analytics requests and does not establish production field latency.

Implementation commit `d8c300d0` is in managed worktree
`/Users/j/.codex/worktrees/search-outcome-measurement/Lifebook`. [PR #270](https://github.com/Jseow008/ThePlayBook/pull/270)
passed PR Scope and has squash auto-merge queued; validate, Security Validation,
Catalog Search Evidence, and Vercel were pending at this checkpoint. No product
decision or database change is pending. Next action after merge: verify the new
events are collected, then stop baseline collection at the stated 14-day limit
and report whether the noninternal sample is sufficient. No broad recovery
retest or rendering change is in scope.

## Retrospective snapshot release verification — 10 October 2026

Released implementation: PR #267, squash commit `53171382`. The signed-in production Browse → Continue reading journey restored the Disney book at 1/11 and showed Saved. This does not exercise the 202 or 429 paths, and the historical recurring conflict remains open. The required disposable hosted verification was not run before promotion; the owner's direct-production request was incorrectly treated as a waiver. Any later hosted result must be labeled retrospective and cannot change that release-process fact.

The owner authorized a short-lived Micro project after production-only testing proved unsuitable for the destructive replay and controlled failure paths. Candidate `edwncosytodqwxvtizgr` was isolated from production `xmuqsgfxuaaophxnwure`, replayed all 113 released migrations after a clean reset, matched all 14 schema fingerprint categories and generated type contracts, and passed five SQL security checks plus the DB-002 transactional proof. Security advisors found no candidate-only warning; the two existing `public.search_catalog` warnings also appear in production. The production build and typecheck passed; all seven application smoke checks passed after two isolated harness settings were corrected. The candidate, its synthetic fixtures, owned application server, private credentials and generated artifacts were removed. No production database write was made. [Sanitized retrospective evidence](evidence/snapshot-recovery-retrospective-20261010.json) records the results and limits.

The released production build, backed by the disposable hosted database, passed controlled 202 polling, 429 recovery with an observed 8.015-second delay for `Retry-After: 8`, and 409 conflict review. Snapshot failures produced zero library mutations; the rejected conflict produced one attempted mutation and no automatic replay after refresh. Two focused unit cases for concurrent deletion and account reset also passed; they are not hosted concurrency proof. The controlled responses were injected in the browser, so they do not identify the cause of the earlier live snapshot error or reproduce the historical recurring conflict. Read-only production Settings inspection still found five existing rejected journal entries displayed as Needs review; no Apply, Discard, or Retry action was taken on real reading data.

The release-process correction merged in [PR #268](https://github.com/Jseow008/ThePlayBook/pull/268): a direct-deployment request cannot silently waive this gate. This retrospective evidence is prepared on branch `codex/snapshot-retrospective-evidence` in managed worktree `/Users/j/.codex/worktrees/retrospective-hosted-verification/Lifebook`, based on `origin/main` `17d02b82`; no application code or migration changed. Next action: publish this evidence in a scoped PR, then validate telemetry coverage and the previously bounded Search outcome before selecting any rendering change. Keep the historical recurring conflict open until new evidence resolves it. No rendering change or Search speed claim is part of this run.

## Save recovery checkpoint — 8 October 2026

Branch `codex/snapshot-recovery`, managed worktree `/Users/j/.codex/worktrees/snapshot-recovery/Lifebook`, based on `origin/main` `dfb9c37b`. Focused implementation commit `784c92cc` is in [PR #267](https://github.com/Jseow008/ThePlayBook/pull/267), open for review. No migration or production database write is included.

Before the single production Retry, the browser held five rejected changes awaiting review and zero pending changes. Retry returned a ready snapshot (201); no save request followed, and the five journal entries were unchanged. The existing Disney book reopened at 1 of 11 sections (library revision 38). The earlier failure's cause remains unknown; rate limiting was not demonstrated. The historical conflict remains open for separate evidence.

The candidate handles a 202 by checking the same snapshot, honors `Retry-After` for 429, preserves local progress through failures, labels server-confirmed versus pending or rejected work, and shows last-known Browse progress. Rejected changes stay review-only; an older rejected change cannot be applied while a newer one for the same item remains unresolved. A signed-in local run recovered the 1/11 record and the new snapshot-status GET returned ready (200). Later local 429 reproduced the intended reader and Browse fallback: the 1/11 copy and resume link remained visible, labeled last-known, with the retry time. Focused tests, lint, typecheck, and build passed. At 390px, mobile Browse had no document overflow; the repository Playwright route check stopped on local CSP/Insights console errors after its layout assertions, so that command is not counted as passing. No product failure was found in that mobile observation.

Release update, 9 October: the owner explicitly requested direct production release without creating a temporary Supabase project. No migration or production `db push` is involved. PR #267 is published; its GitHub file list matches the intended scope and `PR scope` passed. Its first `validate` run failed because component tests still expected the old recovery wording and used incomplete conflict fixtures. The tests have been corrected locally; next action is to pass local checks, push the correction, inspect PR scope again, enable squash auto-merge, then verify the live 1/11 journey. Keep the historical conflict open.

**Reconciled 1 October 2026:** core capture/search/evidence/citation/export work is shipped, but neither all 32 findings nor the complete first-load performance objective is closed. The selector-only Luna release (#217, `e9276438`) passed the frozen quality evaluation and one production smoke; the response took about 11.8 seconds in that browser sample. This establishes functioning, cheaper retrieval, not a general latency target. Factual wait feedback (#218, `23bdaf05`) is merged; production deployment verification is pending. See the [latest checkpoint](PHASE_1_PERSONAL_RETRIEVAL.md#luna-production-rollout-and-factual-wait-feedback--1-october-2026).

## CI Stage 1 — 4 October 2026

Implementation `395551e8` on `codex/ci-stage-one`, workspace `/Users/j/Desktop/Lifebook`: conservative PR verification tiers, broader explicit docs allowlist, and nightly six-viewport browser reporting. Production database gates are unchanged; shared application code remains fully checked. The [verification table](OPS.md#2-testing-and-verification) is the operating reference.

Evidence: 57 focused classifier/workflow/report tests passed; targeted ESLint and diff whitespace checks passed. No failed implementation attempts or pending product decisions. Full hosted CI and the first scheduled browser run remain unverified locally; missing browser fixtures are reported as skipped coverage. Next action: publish the focused PR, verify PR scope, enable squash auto-merge, and let required GitHub checks gate merging in the background. Do not claim measured time savings yet. One agent; external model usage and comparative CI timing were not measured.

## What remains before claiming completion

- **First-load experience:** #201 removed external CSS from the initial rendering path in measured cases. Browse image delivery, Home font arrival and early interaction readiness still need a bounded, matched comparison. The current follow-up reduces unnecessary initial script/image bytes without changing typography or layout. No global performance claim or further model experiment is part of this work.
- **AI wait:** #202 removed the application/database regional mismatch. Provider work still dominates the measured request; quality-qualified Luna and factual progress do not establish that latency is fully resolved.
- **Original acceptance work:** #7 live-list completeness, #11 broader deletion policy, #19 publishing/index readiness, #29 retrieval-outcome measurement, and #30–32 current Auth/recovery sign-off, restoration proof and alert acknowledgement/ownership remain open in the [32-row register](PHASE_1_TRUSTWORTHY_RETRIEVAL_CONTRACT.md#5-finding-register). Reconcile existing evidence before writing code or repeating tests; an unclosed acceptance row is not proof that its implementation is missing.
- **Capacity #28:** bounded production acceptance is recorded in [the checkpoint](PHASE_1_PERSONAL_RETRIEVAL.md#authorized-ai-confirmation--30-september-2026). It remains open at the owner's request; no further broad load test is currently planned.
- **Accepted/deferred scope:** #27 was closed with an explicitly accepted VoiceOver speech-verification gap. Comparative product validation (#1), experiments #14–16, broader publishing/provenance #17 and full revision history #18 remain deferred with their existing triggers.

Next order: verify the #218 rollout, finish the bounded first-load follow-up, then reconcile the outstanding original acceptance items in dependency order. Existing production quotas remain $5/day global including $1/day shared guest allowance. No recurring verification timers are enabled.

## Implemented on main

The [README](../README.md#what-ships-today) lists the product surfaces; [architecture](ARCHITECTURE.md) describes their boundaries. The following recent deliveries are verified in repository history:

| Delivery | Merge evidence | Boundary |
| --- | --- | --- |
| Account library access and verified hydration | [#137](https://github.com/Jseow008/ThePlayBook/pull/137), `faa7353` | Foundation for finding #7; export verification does not independently close every live-list or synchronization requirement. |
| Stale library write protection | [#162](https://github.com/Jseow008/ThePlayBook/pull/162), `e3182888` | Finding #8: exact account revision/reset checks prevent stale bookmark resurrection; explicit refresh after conflict. Recovery is delivered separately in #164. |
| Durable library recovery | [#164](https://github.com/Jseow008/ThePlayBook/pull/164), `d17d8c4d` | Finding #9 for bookmarks/progress: durable account-bound intents, idempotent retries, explicit guest import, and visible conflict recovery. No new offline note/reflection editor. |
| Atomic authenticated AI quotas | [#166](https://github.com/Jseow008/ThePlayBook/pull/166), `00c0471e` | Finding #20: concurrent requests share atomic admission before provider dispatch; counts attempts, not successful answers. |
| Trusted AI identity and burst limits | [#168](https://github.com/Jseow008/ThePlayBook/pull/168), `450fb879` | Finding #21: verified-account limits, trusted/canonical network identity, shared abuse guard and fail-closed backend handling. Hosted and production proof in the [checkpoint](PHASE_1_PERSONAL_RETRIEVAL.md#finding-21-implementation-checkpoint--27-september-2026). |
| Shared AI spending admission | [#170](https://github.com/Jseow008/ThePlayBook/pull/170), `c82a704c` | Finding #22: global/guest admission, conservative reservations, measured settlement and kill switch for three interactive AI routes. Background/admin work is excluded. |
| Complete account export | [#138](https://github.com/Jseow008/ThePlayBook/pull/138), `c6847bb` | Finding #10 delivery; one verified cross-collection snapshot. |
| Separate export allowance, progress, refresh-safe delivery, and resume | [#139](https://github.com/Jseow008/ThePlayBook/pull/139), [#140](https://github.com/Jseow008/ThePlayBook/pull/140), [#141](https://github.com/Jseow008/ThePlayBook/pull/141), [#142](https://github.com/Jseow008/ThePlayBook/pull/142) | Resume reuses a valid server snapshot; the browser retains an opaque reference, not exported account data. |
| Catalog and Notes search | [#145](https://github.com/Jseow008/ThePlayBook/pull/145), `7f479ce` | Findings #2/#12/#13: server search before pagination, lexical ranking/snippets, and distinct errors. This is separate from generative personal retrieval. |
| Account-state/function ACL repairs | [#143](https://github.com/Jseow008/ThePlayBook/pull/143), [#146](https://github.com/Jseow008/ThePlayBook/pull/146) | Repairs are recorded deliveries, not proof against future ACL drift. |
| CI efficiency | [#148](https://github.com/Jseow008/ThePlayBook/pull/148), `6bfdb99` | Scope-aware verification and cancellation of superseded PR checks; required release gates remain. |
| Typed personal retrieval and evidence extracts | [#153](https://github.com/Jseow008/ThePlayBook/pull/153), `d159c6f8` | Findings #3/#4/#6 delivery; matched responses use attributed extracts. Broader synthesis remains deferred; validated citation navigation shipped separately in #158. |
| Validated citations and exact-passage views | [#158](https://github.com/Jseow008/ThePlayBook/pull/158), `610724e2` | Finding #5 delivery; live ownership/session rechecks and explicit changed/withdrawn/unavailable states. Secondary reader link is general, not a historical reader offset. |
| Database-native snapshot maintenance | Reviewed [#154](https://github.com/Jseow008/ThePlayBook/pull/154), shipped in #153 | Private hourly Supabase Cron replaces the failing HTTP worker; #154 is closed as superseded. |
| Replayable deployed book identity schema | [#155](https://github.com/Jseow008/ThePlayBook/pull/155), `7ff1dd98` | Records existing production ISBN/identity definitions and grants; preserves publishing compatibility. |

Earlier export/resume handoffs reported production smoke success. The current release verification below does not rerun every earlier workstream; confirm the deployed commit and environment when making a new operational decision.

## Current retrieval release

PR #153 shipped typed highlights, notes and reflections with attributed evidence extracts. The historical generated-answer candidate failed grounding (86/90); it remains evidence against releasing broader synthesis. All 90 replacement extract responses were independently reviewed. That historical evaluation retained three known irrelevant selections as failures. The later #217 Luna selector evaluation passed all 56 cases across three runs (168 independent calls); the previous failed experiments remain recorded. See [qualification evidence](PHASE_1_PERSONAL_RETRIEVAL.md#luna-correction-qualifies-for-application-rollout--1-october-2026).

The combined release passed a data-less hosted 105-migration replay, matching production schema/type contracts, six security checks, targeted database behavior tests, and all seven application smoke checks. All three reviewed migrations are applied; the follow-up production dry-run is clean and 46 existing captures are indexed and ready. The candidate's hourly Cron tick and a manual production maintenance run succeeded. A 26 September read-only production audit also recorded three successful hourly snapshot-maintenance Cron executions and a successful scheduled personal-evidence worker run.

Vercel deployed `d159c6f8`. Live authenticated empty-scope retrieval returned 200 and the same session returned 401 after actual revocation; the temporary account was removed. The index worker's production-credential GitHub dispatch passed. Health and Browse returned 200. Details and retained evidence: [personal retrieval checkpoint](PHASE_1_PERSONAL_RETRIEVAL.md#production-release-continuation--26-september-2026). The hosted branch, credentials and isolated services were removed.

## Citation production closeout — 26 September 2026

GitHub reports successful production deployments of #158 (`610724e2`) and the
current main (`820fe7b7`). One temporary ordinary account saved a synthetic note
against an existing public source; the live worker indexed it, Notes returned its
exact text and a server-issued reference, and the deployed resolver returned the
matching passage. After capture deletion the same reference returned unavailable
without an excerpt; after real session revocation it returned 401. The passage
page returned 200. All temporary account/capture data was removed; existing
personal data and public content were unchanged.

[Sanitized production evidence](../tests/fixtures/retrieval/evidence/citation-production-20260926.json)
records each check. This HTTP journey supplements #158's Chromium/WebKit checks;
it does not replace a screen-reader audit or the complete later-session/export
journey. Search/model evaluation was unchanged and not rerun.

## Deferred and separately open

- Core retrieval implementations through #5 are shipped. Remaining acceptance boundaries for #7 stay explicit in the register; #27 is closed by owner acceptance of its documented VoiceOver verification gap; broader synthesis and full editorial revision history remain deferred.
- AI safeguards #20–#24 are shipped within their recorded scope. Remaining operational proof, and later product experiments retain their acceptance obligations in the [32-finding register](PHASE_1_TRUSTWORTHY_RETRIEVAL_CONTRACT.md#5-finding-register).
- The account-deletion/revision-trigger defect is repaired in production by `20260926150259_account_deletion_library_revision.sql` ([#161](https://github.com/Jseow008/ThePlayBook/pull/161)). Real hosted and production Auth deletion proofs pass; full durability acceptance remains separate. See [release evidence](../tests/fixtures/retrieval/evidence/account-deletion-release-20260926.json).

## Latest completion: mutation boundaries (#23)

The [inventory and correction plan](PHASE_1_PERSONAL_RETRIEVAL.md#finding-23-mutation-boundary-inventory--27-september-2026) covers ordinary account writes and records the separately controlled admin, worker, Auth and read surfaces. Library/capture admission shipped in [#174](https://github.com/Jseow008/ThePlayBook/pull/174), `e8e93d70`. Remaining feedback, votes, preferences/profile, activity and legacy usage corrections merged in [#176](https://github.com/Jseow008/ThePlayBook/pull/176), `a7cc3271`; production migration, parity, security checks and authenticated application smoke passed. This build passed production verification; #23 is complete for the recorded ordinary-account inventory. The [release checkpoint](PHASE_1_PERSONAL_RETRIEVAL.md#finding-23-remaining-write-boundaries--27-september-2026) records hosted/runtime evidence and temporary-project cleanup. The wider audit remains open.

## Latest verified release: graceful chat failures (#24)

[#178](https://github.com/Jseow008/ThePlayBook/pull/178) added bounded deadlines and explicit incomplete-answer recovery. Its production request-adapter failure was rolled back; [#179](https://github.com/Jseow008/ThePlayBook/pull/179), `ca30f92f`, corrects the runtime request handling and passes required CI plus real preview HTTP probes. Corrected production deployment and live HTTP smoke passed on 27 September, including a real completed public-source chat response. #24 is complete within its recorded interactive failure scope. See the [release checkpoint](PHASE_1_PERSONAL_RETRIEVAL.md#finding-24-graceful-chat-failures--27-september-2026). The combined #26 proof is recorded below.

## Combined journey proof (#26) — 27 September 2026

The unchanged application at `da8d62c2` passed the complete ordinary-user journey
in a local production build: bookmark/reflection capture, sign out and fresh OTP
login, real indexing/retrieval, opening the exact cited passage, and Settings export
reconciliation. Both captures appear exactly once; all 11 export collections were
verified. The reusable runner fails on missing prerequisites or stages and verifies
fixture/server cleanup. This closes the recorded #26 fixture; it is not a new
production deployment, email-delivery test or broad retrieval-quality benchmark.
[Evidence and run history](PHASE_1_PERSONAL_RETRIEVAL.md#26-combined-journey--verified-27-september-2026).
Next acceptance gap: #28 capacity verification; analytics and operational readiness
retain separate open entries in the register.

## Accessibility closeout (#27) — 28 September 2026

[#182](https://github.com/Jseow008/ThePlayBook/pull/182) merged as `8c1ad354` after
required checks passed. It fixes reflection labeling, Notes response announcements
and export progress semantics. The owner explicitly accepted the unavailable actual
VoiceOver verification and requested closure. **#27 is closed by that decision;
spoken-output testing did not pass or complete.** The [evidence record](evidence/screen-reader-verification-20260928.md)
retains the limitation and unexecuted checklist. This records the merge, not a new
production deployment verification. Local main is updated.

## Updating this page

Record a delivery with its PR/commit and scope. Mark production verification separately with dated evidence. Use the existing workstream document for detailed checkpoints rather than adding transcript-sized logs here. The old [docs/AGENT.md](AGENT.md) path is a compatibility pointer; agent instructions live only in root [AGENTS.md](../AGENTS.md).


## Readiness reconciliation — 1 October 2026

Rechecked the32-finding register against `origin/main` at05e444a0 and retained
release evidence. Snapshot maintenance is already repaired (#153/#160), not a new
repair task: read-only production verification at14:18UTC found24 hourly successes,
zero failures in24h and zero overdue snapshot/lease/terminal-operation counts.
[Sanitized evidence from 1 October](evidence/snapshot-maintenance-status-20261001.json).
No production records or settings changed. #32 still needs alert acknowledgement
and ownership proof; healthy scheduling alone cannot close it.

PR #226 has since merged as `3d237397`. It records a documentation-only
closeout; its performance targets remain unresolved. The remaining scope is
summarized in the [register](PHASE_1_TRUSTWORTHY_RETRIEVAL_CONTRACT.md#reconciled-next-work--1-october-2026).

Next priority: #30–32 operational evidence—read-only Auth/recovery review and alert
ownership inventory before planning a scoped restore drill. #7/#11/#19/#29 and
explicitly deferred product/history findings retain their separate obligations.
#28 remains open by instruction. No recurring timers or new benchmark is needed.

Preparation context: this reconciliation started on
`codex/readiness-reconciliation` at05e444a0. Only STATUS, the existing register
and the sanitized maintenance evidence are in scope. The initially guessed old
workflow filename returned404; workflow listing
and the deployed cron migration established the replacement, then live SQL verified
its health. No user data or credentials were read into the record.
