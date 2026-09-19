# Netflux release and workstream status

**Repository snapshot reviewed:** `6bfdb99` on 19 September 2026. This page distinguishes merged implementation from unfinished work. It does not perform or claim a new production smoke test.

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

The release handoffs in the working conversation reported production export/resume smoke success. This housekeeping pass verifies the merge history and relevant source only; confirm the deployed commit and current environment when making a new operational decision.

## Held work — not on main

Typed retrieval for highlights, attached notes, and reflections (#3/#4/#6) is on `codex/typed-personal-retrieval`, checkpoint `cd2c7fd`. Its branch-local `docs/PHASE_1_PERSONAL_RETRIEVAL.md` records the implementation and raw evidence; that file is not part of main at this snapshot.

The completed candidate benchmark has passing retrieval/access/quotation results, but independent AI review found only 86 of 90 generated answers grounded. Four unsupported claims keep the candidate held. All 90 answers were reviewed; there was no selective rerun. The proposed alternative—concise attributed evidence extracts instead of freeform synthesis—awaits a product decision and is not implemented. No personal-index production migration or deployment is recorded for this candidate.

## Deferred and separately open

- Validated citations and exact-passage navigation (#5) follow the typed retrieval contract; existing reader links are not proof of that workstream.
- The scheduled snapshot-maintenance failure remains explicitly deferred. Its historical 404 report is not a fresh endpoint check, and this documentation change does not resolve it.
- Broader durability (#8/#9), AI safeguards (#20–#24), remaining operational proof, and later product experiments retain their acceptance obligations in the [32-finding register](PHASE_1_TRUSTWORTHY_RETRIEVAL_CONTRACT.md#5-finding-register).
- The held branch recorded an account-deletion/revision-trigger defect during disposable cleanup. Removing fixture library rows before deleting its account was a cleanup workaround, not a production fix; track it with the durability workstream.

## Updating this page

Record a delivery with its PR/commit and scope. Mark production verification separately with dated evidence. Use the existing workstream document for detailed checkpoints rather than adding transcript-sized logs here. The old [docs/AGENT.md](AGENT.md) path is a compatibility pointer; agent instructions live only in root [AGENTS.md](../AGENTS.md).
