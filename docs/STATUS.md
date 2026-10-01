# Netflux release and workstream status

**Reconciled 1 October 2026:** core capture/search/evidence/citation/export work is shipped, but neither all 32 findings nor the complete first-load performance objective is closed. The selector-only Luna release (#217, `e9276438`) passed the frozen quality evaluation and one production smoke; the response took about 11.8 seconds in that browser sample. This establishes functioning, cheaper retrieval, not a general latency target. Factual wait feedback (#218, `23bdaf05`) is merged; production deployment verification is pending. See the [latest checkpoint](PHASE_1_PERSONAL_RETRIEVAL.md#luna-production-rollout-and-factual-wait-feedback--1-october-2026).

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
[Sanitized current evidence](evidence/snapshot-maintenance-status-20261001.json).
No production records or settings changed. #32 still needs alert acknowledgement
and ownership proof; healthy scheduling alone cannot close it.

PR #226 is documentation-only, auto-merge enabled and still awaiting required
validation at this checkpoint; do not claim merged. Its performance targets remain
unresolved. The remaining scope is summarized in the [register](PHASE_1_TRUSTWORTHY_RETRIEVAL_CONTRACT.md#reconciled-next-work--1-october-2026).

Next priority: #30–32 operational evidence—read-only Auth/recovery review and alert
ownership inventory before planning a scoped restore drill. #7/#11/#19/#29 and
explicitly deferred product/history findings retain their separate obligations.
#28 remains open by instruction. No recurring timers or new benchmark is needed.

Continuity: this documentation reconciliation is on `codex/readiness-reconciliation`
in `/Users/j/.codex/worktrees/readiness-reconciliation/Lifebook`, based on05e444a0.
Only STATUS, the existing register and the sanitized maintenance evidence are in
scope. Exact next action: publish this record through normal PR gates, then use the
register for operational follow-up; do not revisit the historical404 as an active
incident. The initially guessed old workflow filename returned404; workflow listing
and the deployed cron migration established the replacement, then live SQL verified
its health. No user data or credentials were read into the record.
