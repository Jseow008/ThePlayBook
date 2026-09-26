# Netflux release and workstream status

**Latest production verification:** authenticated citation HTTP journey on `820fe7b7` on 26 September 2026; citation code shipped as `610724e2` (#158). Earlier deliveries retain their own scope and evidence. This is not blanket closure of the 32-finding register.

## Implemented on main

The [README](../README.md#what-ships-today) lists the product surfaces; [architecture](ARCHITECTURE.md) describes their boundaries. The following recent deliveries are verified in repository history:

| Delivery | Merge evidence | Boundary |
| --- | --- | --- |
| Account library access and verified hydration | [#137](https://github.com/Jseow008/ThePlayBook/pull/137), `faa7353` | Foundation for finding #7; export verification does not independently close every live-list or synchronization requirement. |
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
- Broader durability (#8/#9), AI safeguards (#20–#24), remaining operational proof, and later product experiments retain their acceptance obligations in the [32-finding register](PHASE_1_TRUSTWORTHY_RETRIEVAL_CONTRACT.md#5-finding-register).
- The account-deletion/revision-trigger defect is repaired in production by `20260926150259_account_deletion_library_revision.sql` ([#161](https://github.com/Jseow008/ThePlayBook/pull/161)). Real hosted and production Auth deletion proofs pass; full durability acceptance remains separate. See [release evidence](../tests/fixtures/retrieval/evidence/account-deletion-release-20260926.json).

## Updating this page

Record a delivery with its PR/commit and scope. Mark production verification separately with dated evidence. Use the existing workstream document for detailed checkpoints rather than adding transcript-sized logs here. The old [docs/AGENT.md](AGENT.md) path is a compatibility pointer; agent instructions live only in root [AGENTS.md](../AGENTS.md).
