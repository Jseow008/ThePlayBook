# Netflux release and workstream status

**Latest production verification:** shared AI spending controls (#22), implementation [#170](https://github.com/Jseow008/ThePlayBook/pull/170) (`c82a704c`), verified live on `71c7c8b0` on 27 September 2026. The approved $5/day global ceiling includes $1/day shared by guests. A live request completed and settled at $0.002756; health returned 200. [Policy and procedures](OPS.md#541-interactive-ai-spending-controls-22) and [release evidence](PHASE_1_PERSONAL_RETRIEVAL.md#finding-22-approved-production-policy--27-september-2026) retain exact scope, exclusions and verification. Earlier deliveries retain their own evidence; this is not blanket closure of the 32-finding register.

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

PR #153 shipped typed highlights, notes and reflections with attributed evidence extracts. The historical generated-answer candidate failed grounding (86/90); it remains evidence against releasing broader synthesis. All 90 replacement extract responses were independently reviewed. Frozen diagnostic thresholds pass, with the three known irrelevant selections still counted as failures.

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

- Core retrieval implementations through #5 are shipped. Remaining acceptance boundaries for #7, #26 and #27 stay explicit in the register; broader synthesis and full editorial revision history remain deferred.
- AI safeguards #20–#22 are shipped within their recorded scope. Remaining safeguards (#23–#24), operational proof, and later product experiments retain their acceptance obligations in the [32-finding register](PHASE_1_TRUSTWORTHY_RETRIEVAL_CONTRACT.md#5-finding-register).
- The account-deletion/revision-trigger defect is repaired in production by `20260926150259_account_deletion_library_revision.sql` ([#161](https://github.com/Jseow008/ThePlayBook/pull/161)). Real hosted and production Auth deletion proofs pass; full durability acceptance remains separate. See [release evidence](../tests/fixtures/retrieval/evidence/account-deletion-release-20260926.json).

## Current bounded work: mutation boundaries (#23)

The [inventory and correction plan](PHASE_1_PERSONAL_RETRIEVAL.md#finding-23-mutation-boundary-inventory--27-september-2026) compares current routes with read-only production grants, RLS, triggers and RPC exposure. The original direct bookmark-write path is closed. Remaining direct-write/resource-limit gaps are documented; #23 is **open**, not closed by this inventory. Library and capture admission shipped in [#174](https://github.com/Jseow008/ThePlayBook/pull/174), `e8e93d70`: production migration/schema/security checks and authenticated save/replay/capture smoke passed. The [current checkpoint](PHASE_1_PERSONAL_RETRIEVAL.md#finding-23-library-and-capture-admission--27-september-2026) records the evidence. Feedback, votes, preferences/profile, activity and legacy usage remain the next bounded scope; #23 is not yet complete.

## Updating this page

Record a delivery with its PR/commit and scope. Mark production verification separately with dated evidence. Use the existing workstream document for detailed checkpoints rather than adding transcript-sized logs here. The old [docs/AGENT.md](AGENT.md) path is a compatibility pointer; agent instructions live only in root [AGENTS.md](../AGENTS.md).
