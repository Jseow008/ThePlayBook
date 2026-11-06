# Library Ask hybrid follow-ups

Authorized 7 November 2026. Branch `codex/library-ask-followups`, worktree
`/Users/j/.codex/workspaces/netflux-library-ask-followups`, base `eefed48c`.
#329 is merged and included. #330 touches Completed and Library controls only;
no dependency or overlap with Ask.

The change preserves the existing layout, evidence/citation boundaries, account
isolation, draft handling and #328 recovery. Up to two explicit questions reuse
an existing Library generation/selection call. Simple clarification/no-evidence
fallbacks need no new call. The answer remains available when optional questions
are missing, malformed or exceed their allowance. Suggestions never auto-send or
fill the composer; completed suggestions recover with their answer.

No schema, query, authorization, production data, dependency or provider changes
are intended. Notes selection remains unchanged. Added tokens are not free; no
cost-saving claim against static buttons. Provider limits remain unchanged.

Implementation and verification in progress. Next: connect bounded structured
questions to both existing response paths, test failure/recovery/isolation and
compare a small synthetic provider sample before broader affected validation.

## Implementation checkpoint

Both existing Library AI paths now return optional questions with their original
call. Structured metadata output streams decoded answer text; selector output
keeps the existing assessment as its first complete field and questions separate.
Critical fields still validate strictly. A malformed optional suffix or token
limit after the complete critical field does not invalidate the answer. The
qualified Notes/Luna adapter and default selection request remain byte-identical;
a Library-only wrapper handles a complete core before an optional truncated tail.
The existing 1,600-token selector ceiling and per-intent answer limits remain.

Client data parts persist through #328 without a storage/schema change. Old
recovered transcripts retain their original actions. New unavailable questions
produce no buttons; clarification/no-evidence paths use bounded static starters.
Buttons send their full explicit question, preserve unrelated drafts, wrap on
narrow screens, and do not appear until their answer completes.

Verification so far: full local suite 267 files/2,228 tests passed, 317 conditional
skips, plus 34 capacity-harness checks. Focused provider/SDK tests cover Anthropic,
OpenAI and Luna, including malformed/missing/truncated optional questions, strict
evidence rejection, one-call settlement, real SDK JSON-to-text streaming, exact
drafts, pending display, restore and account isolation. The earlier 160-test run
caught a frozen Luna adapter identity change; restored the qualified adapter and
introduced the Library-only wrapper. Its 54-test boundary rerun passes. Final
lint/types/build and fixed Library model sample remain in progress.

Development diagnostics remain preserved: first paired run stopped at an existing
baseline comparison miss (c05 instead of c04+c05); no claim this was introduced by
follow-ups. Revised six-case variant selected all expected IDs but some questions
interviewed the reader. Added a user-voice constraint/filter; a fresh two-case
check returned valid evidence with empty questions, exposing overly restrictive
search wording. Clarified exploratory-search instructions rather than adding a
second AI call or retry. No further tuning during the frozen run. Three fixed
runs of all 22 Library cases are underway, bounded to 66 calls, concurrency two.
No old responses validate the changed Library prompt. Notes evidence is unchanged.

Browser component fixture: actual Ask client, current CSS and SDK transport, with
explicit deterministic local responses and a fixed synthetic owner. Desktop and
390px checks passed answer-before-questions, separate exact multiline draft,
question-click submission, reload preserving original questions/draft, explicit
New chat and missing-question answer recovery. Width=scrollWidth=390. Screenshots
saved in task library-followups-implementation. This does not verify live auth,
production routing, database retrieval or real-device Safari. Initial Vite fixture
middleware order caused an HTTP failure; fixed harness registration before testing.
Owned tab closed, viewport reset, fixture server stopped. No accounts/DB writes.

Build setup: initial default Turbopack cannot resolve a node_modules symlink
outside this worktree; no config change made. Webpack build compiled but caught
two optional-field annotations in the verification script; fixed and rebuilding.
Final CI uses a normal dependency installation. No production release claim.
Next: finish fixed sample/answer probe, review all generated questions, complete
build checks and lint; inspect scope, publish PR and enable protected auto-merge
only after PR scope passes. No query, schema or authorization changes are needed.

## Final verification and review

The fixed Library run completed 66/66 calls (22 cases × 3), no retries or provider
errors. All required IDs were retained; exact-quote targets and exclusions had no
errors. Zero-extra selection was 63/66: Willow extra in runs 1/3 and Aspen extra
in run 2. Each run is 21/22 (95.45%); the existing subset rejection floor is 95%
overall and 90% per run. These misses remain, not rewritten as a perfect result.
This is selection-only proof, not a new hosted database/quote-fidelity result.
Raw compressed output and a bounded summary are committed under docs/evidence;
the unchanged baseline/corpus hashes and each changed request hash are recorded.
Default Notes prompt/adapter provenance remains covered by existing fixture tests.

Review of questions identified several English advice-style requests without an
explicit saved-record scope. The final deterministic validator drops those rather
than regenerating. Replaying that validator against the preserved model sample
leaves 66 questions across 42 turns. No prompt or selection changes during this
frozen run; no extra provider requests for filtering. Empty questions are valid.

A separate live metadata probe produced its answer and two relevant questions in
one call, 65 output tokens, below the existing 250-token cap. Neither these token
counts nor historical comparisons establish a production cost/latency saving.
Total live calls during this task: 3 initial paired diagnostic, 6 revised
synthetic development, 2 fresh voice checks, 66 fixed Library, 1 metadata = 78.
The first diagnostics remain preserved, including the baseline miss and empty or
reader-directed suggestions; no selective replacement of their evidence.

Final review also covered transport failure while optional questions stream:
a structurally closed answer field is retained without questions; an unfinished
answer or aborted account/navigation request stays retryable. Both paths pass
through the real SDK mock-provider boundary, one call each, with safe errors and
no private provider details. The existing quoted/extract answer text is unchanged.

Normal Turbopack build, all 5 Sharp trace checks and critical CSS passed after a
worktree-local dependency directory replaced the external symlink. A final build,
full tests and lint are rerunning after the optional-tail disconnect safeguard.
No package/lockfile or production configuration change was needed. Own browser
fixture is stopped; screenshots and synthetic events are kept outside the repo.
No live accounts, saved-content writes, schema/query/hydration/mutation/auth
changes, production deployment or database rollout occurred.

Publication pending final checks: inspect exact staged scope, commit and create a
ready PR. Enable squash auto-merge after PR scope passes; required CI/security
must gate release. Do not wait for post-merge production deployment unrequested.

Final local candidate checks passed: 2,230 tests in 267 passing files, 317
conditional skips, 34 capacity checks, full lint/type ratchets and normal
Turbopack production build including all 5 Sharp traces and critical CSS.
The optional-tail safeguard passed both complete and incomplete answer transport
cases through the real SDK. The one build invocation without local public env
values failed configuration; rerun with explicit synthetic public config passed.
No implementation blockers remain. Exact 16-file scope reviewed; publication next.
