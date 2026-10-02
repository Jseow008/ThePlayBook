# Typed personal retrieval (#3, #4, #6)

Status: **released and production-verified on 26 September 2026** at `d159c6f8` (PR #153, including #154).

## Evidence-first continuation — 26 September 2026

The user approved replacing final prose generation for matched retrieval responses with structured, attributed extracts. The original answer-v2 failure below remains preserved; it is not a pass for the new renderer.

- Branch: `codex/evidence-first-retrieval`; worktree: `/Users/j/Desktop/Lifebook-evidence-first`.
- Recovered committed checkpoint `cd2c7fd` onto current main `8ac20e8`; temporary worktree loss did not require reimplementation.
- Shared server rendering labels source/highlight/note/reflection text, verifies stored spans, marks excerpts, and escapes Markdown data. No generated facet headings or new citation-navigation claims.
- Matched Notes and Library responses skip final prose generation. Existing deterministic exact quotes/empty responses stay. Library metadata and the existing no-Gemini metadata-advisor fallback are outside this change; Sonnet is not removed globally.
- Embedding/index/selector behavior is unchanged. Database capture now records the served extract text; evaluator review remains required for extracts despite zero final-generation calls. Historical failed outputs and frozen thresholds are retained.
- Verification at `ff00cff`: Security Validation, catalog evidence, scope and Vercel passed. Disposable Supabase ran 16/16 runtime fixtures, 175/175 retrieval checks and 178 security tests. Local evidence: 1,392 tests passed (216 conditional skips), lint and production build passed; after reviewer corrections, 110 focused tests and typecheck passed. Full CI browser validation was still running at handoff. The authenticated browser journey is completed in the release continuation below; the hosted database release gate remains outstanding.
- Reviewer caught and rechecked three corrected regressions: empty advisor fallback, indented-text Markdown fidelity, and Library start analytics. CI then passed 13/16 existing database fixtures but hit the default five-second whole-test timeout in three multi-operation scenarios. Those fixtures now have explicit 30-second bounds; production deadlines and frozen thresholds are unchanged.
- Extract evidence: all 174 case-runs captured; all 90 extract responses independently AI-reviewed with response/corpus hashes. Grounding, requested-facet completeness and attribution passed. The same three Willow irrelevant selections remain failures in the rejection metric (171/174); no threshold or fixture label changed. `tests/fixtures/retrieval/evidence/extract-provenance-v1.json` binds the lossless capture, responses, reviews and score. The diagnostic thresholds pass; this is not a production release pass.
- One primary implementer and one fresh-context reviewer, reused for correction verification and semantic review. Approximately 30 minutes elapsed from checkpoint recovery (`12:25:58 +0800`) to evidence packaging; this is a bounded interval, not total historical task time. New provider calls: zero. One CI retry followed the three explicit fixture-timeout corrections; no model-tuning loop. Agent token usage is unavailable, so no measured token-saving claim. The reviewer prevented three concrete regressions.
- No production migration or deployment has occurred. The reviewed response change is approved; separate hosted rehearsal/cost and production release evidence remain unresolved.

## Release continuation — 26 September 2026, 14:43 Singapore

- Both required CI checks passed on `6e2e29c`. A real local production-build journey now covers reader capture, actual indexing, Notes and Library extracts, and sign-out clearing. Desktop/mobile inspection found unwrapped literal blocks; three scoped wrapping classes fix this without changing text, selection or auth. Production build, targeted lint and independent review pass. Evidence: `tests/fixtures/retrieval/evidence/extract-authenticated-browser-journey-v1.json` and its screenshots. Final follow-up CI must finish before release.
- Combined disposable database checks for #153/#154: 38/39 initially passed; the remaining direct-worker identity check passed after correcting the test connection from administrator to restricted worker. Production permissions were not changed. Both migrations are applied only to the disposable database.
- Production project `xmuqsgfxuaaophxnwure` has exactly the 102 migration versions on main through `20260918151058`. The earlier March-cutoff diagnosis is contradicted; do not repair history. Production dry-run lists only the personal-evidence index and snapshot-cron migrations, in chronological order. #154 contains the corrected diagnosis and read-only preflight artifact.
- Combined rehearsal worktree: `/Users/j/Desktop/Lifebook-retrieval-release`, branch `codex/retrieval-maintenance-release`. Parent PRs stay separate. Apply/verify cron before deploying removal of its old HTTP worker.
- Remaining blocker: hosted branch price acknowledgment (quoted US$0.01344/hour) is pending. After acknowledgment, create a data-less candidate, complete hosted replay/schema/security/application verification, review the exact production dry-run, then proceed through the production gate. No production mutation, merge or deployment has occurred.
- Approximately 30 minutes for this continuation, including setup downloads. One primary implementer and one bounded reviewer. Reused the frozen quality benchmark; three live synthetic retrieval queries exercised the browser boundary. Agent token usage is unknown. Preflight all runtime dependencies before reusing a prepared build: Redis and the cursor secret were missing here.

## Hosted release gate — 26 September 2026

- The user approved the temporary hosted branch price. Data-less candidate `wadjiymmnupaonongzxu` was created in the approved organization; production was never reset or relinked.
- Main's 102 migration versions match production, but a clean replay lacked already-deployed book ISBN/identity definitions and explicit service-role grants. PR #155 records those existing definitions. Clean baseline plus reconciliation matches all 14 production schema fingerprint categories and fresh raw generated types. No production history repair is needed.
- Combined 105-migration replay and follow-up dry-run pass. Six security checks, DB-002 highlight preservation, publishing behavior, and five targeted hosted maintenance/worker tests pass. Fresh generated types preserve existing application aliases and nullable email-RPC arguments; typecheck and 86 affected tests pass.
- Hosted production build and all seven smoke checks pass with synthetic admin/content only. Local smoke uses loopback plus the platform-style forwarded client-IP header; initial attempts exposed local HTTPS/header setup differences, not application failures. No gate was disabled.
- Advisors show the intentional private personal-index tables with RLS/no browser policies and the already-approved public catalog RPC warnings. Candidate-only unused-index and Auth pool-sizing info are expected; no unexpected security warning was added.
- Exact production dry-run: `20260918164448_add_personal_evidence_index.sql`, `20260926043844_add_snapshot_maintenance_cron.sql`, `20260926065035_reconcile_existing_production_book_schema.sql`. Latest completed backup: `2026-09-25T23:45:02.269Z`.
- Evidence: `tests/fixtures/retrieval/evidence/retrieval-maintenance-hosted-20260926.json`. PR #153 temporarily incorporates parent #155 to resolve the generated-type contract before release; after #155 merges its changes leave #153's diff.
- All three production migrations applied under existing authorization. Production has 105 versions, a clean follow-up dry-run, matching schema fingerprints and generated types, and six passing security checks. All 46 captures indexed successfully with no failed/deferred rows. Production maintenance ran successfully (four expired snapshots and four old operations removed).
- Candidate Cron also succeeded on its actual hourly schedule at 07:17 UTC. Hosted branch deletion and absence were verified; isolated app/Redis and candidate credentials are cleaned up.
- PR #155 merged as `7ff1dd98`. Strict up-to-date branch protection would serialize repeated full CI for #153/#154, so the remaining reviewed changes are packaged together in #153 on current main. The implementation matches the tested combined candidate. #154 stays open until #153 merges, then closes as superseded. Next: final exact-head CI, squash merge #153, verify deployment and authenticated route behavior. Do not reapply migrations or rerun unchanged model evaluations.

## Production release continuation — 26 September 2026

- PR #155 merged as `7ff1dd98`; combined #153 merged as `d159c6f8` with every required check passing. #154 is closed as superseded; its reviewed implementation is included unchanged in #153. The merged application tree matches the hosted candidate.
- The three reviewed migrations are applied, all 46 existing captures are ready, and production schema/types/security/dry-run checks pass. Do not reapply migrations or rerun unchanged model-quality evidence.
- Hosted branch `wadjiymmnupaonongzxu` was deleted and absence verified. Its private credentials, synthetic fixtures, isolated app, and Redis services were removed. The unrelated prepared local Supabase instance was left alone.
- Production deployment `6676337814` reports success for `d159c6f8`; Vercel commit status and main validation/security checks passed. On `www.netflux.blog`, an authenticated empty-scope Notes request returned 200, then the same cookie returned 401 after real Supabase session revocation. The temporary user was deleted; no personal captures were created. Health and Browse returned 200.
- GitHub worker dispatch [36228298889](https://github.com/Jseow008/ThePlayBook/actions/runs/36228298889) passed using the configured production cron credential: no queued claims, failures or deferrals. Snapshot maintenance is active hourly; its manual production run and the candidate scheduled run passed. The first production scheduled tick was not separately awaited.
- Release work is complete. Next product workstream: validated citations and exact-passage navigation (#5). Existing synthesis failures, the three irrelevant selections, and the separately recorded account-deletion defect remain visible; this release does not close those broader concerns.
- One primary implementer and one reused bounded reviewer. The reviewer caught migration delimiters and ambient database-URL precedence in the disposable test runner. These were fixed before release. No additional quality benchmark or prompt-tuning pass ran. Token usage is unavailable. Approximately 54 minutes elapsed between hosted-branch creation (06:46 UTC) and the combined app merge (07:40 UTC), including reconciliation, verification, and CI wait; this is not total historical task time.

## Historical generated-answer verification (superseded by evidence extracts)

**The complete answer-v2 execution fails grounding and is not approved for release.**
All 174 case-runs completed, including 90 actual model answers across three runs,
with no provider failure or retry. Independent AI review found 86/90 grounded and
90/90 covering the requested facets. All three Rowan source-guidance answers add
or reverse causal claims in an optional personal reflection; one Juniper answer
adds an unsupported concluding generalization and timing. These failures occur
after correct evidence retrieval. They are not excused by the passing recall,
quotation, abstention, access-control, or measured token-budget results.

The answer-v2 raw JSON is preserved losslessly in
`evidence/final-generation-v2-selector-v4-answer-v2.json.gz`; its provenance file
binds the frozen corpus, updated database capture, provider counters, independent
reviews, and failed score. The scoring command exits 1. All 90 responses were
reviewed, with no selective rerun or automatic self-grade. That historical failure led to the approved extract response contract above;
no further prompt-only generation iteration was performed.

The v4 selector passes the frozen v2 database retrieval gates. All 174 case-runs
completed with exact provider-request hashes verified: required-evidence recall
is 100% in every class/run, zero-extra-ID rejection is 171/174 (98.2759%), exact
stored quotations are 36/36, and actual forbidden-ID/session checks pass. Each
run includes one irrelevant additional personal capture for the Willow editorial
question; those three misses remain recorded. All requested comparison facets
and required field text survived composition. These are retrieval results, not a
final-answer quality pass. Evidence is in `provider-selections-v2-selector-v4.json`
and `evidence/database-quality-v2-selector-v4.json` under the retrieval fixtures.

The first answer-generation batch is preserved and held: 30 actual model answers
completed before the measurement runner submitted an invalid empty message to
the provider's token-count endpoint. The corrected runner records an explicit
structural zero when no evidence message or model request exists. It can resume
this precise operational failure without repeating confirmed model responses,
but continuation is paused for a separate quality reason. Independent review
found 28/30 answers grounded and 30/30 complete: one Haiku answer changed a spatial
detail, and one Sonnet answer added unsupported event timing. All 11 applicable
answers preserved attached-note attribution. Neither stronger-model assumptions
nor passing retrieval scores excuse those factual changes. The original raw
artifact, failure provenance and response-bound review remain under `evidence/`;
the 60 unexecuted model answers are not counted as passes. A narrow answer-prompt
appendix now asks for precise evidence wording and omits unrequested recaps. Before
adoption, six separately authored development cases passed one baseline and three
candidate runs each (24 real provider calls, independently reviewed). Those examples
establish non-regression, not a holdout pass. The raw development answers and review
are preserved as `grounded-answer-development-v1.json` and
`grounded-answer-development-review-v1.json`. The changed prompt then underwent the
complete answer-v2 execution above. Existing selector decisions and embeddings
were reused with exact request-hash verification; all 90 final answers were new.

The final-code browser journey at `87599d1` passed capture, actual indexing,
reflection-only exact retrieval, reader reopening and verified export. Independent
AI review passed its Library answer's grounding and personal/source attribution.
The visible answer cites the highlight, so it alone does not establish current
editorial-source selection; that is measured separately by the database cases.
It also exposed dormant Notes storage left by Settings sign-out. The shared auth
listener now clears those Notes keys even when the Notes panel is unmounted.
Focused tests and a final-build, no-provider Settings sign-out check pass; unrelated
storage remains intact. The original journey and its limitations remain in
`evidence/final-build-auth-retrieval-journey-v2.json`, with the correction verified
in `evidence/dormant-notes-logout-browser-smoke-v1.json`.

Production environment metadata confirms the model overrides are absent, so the
candidate uses the benchmarked Anthropic defaults. Gemini/Anthropic credentials
are present. `CRON_SECRET` exists in both Vercel Production and GitHub Actions;
an earlier missing-secret report was incorrect because environment downloads omit
sensitive values. Metadata proves presence, not equality of the two values. The
authenticated worker smoke remains a rollout check; no rotation is justified by
this preflight and no production settings were changed.

### Preserved earlier failures

The frozen v1 quality gate fails. All 174 database case-runs executed with recorded
real-provider decisions: required-evidence recall is 97.53%, exact stored quotes
36/36, and explicit forbidden-record/session checks pass. Irrelevant-evidence
rejection is only 118/174 (67.82%), below the approved 95%. Do not waive that gate
or replace it with the easier explicitly named-distractor score. See
`tests/fixtures/retrieval/PROVIDER_SELECTION_FAILURE_AUDIT.md` for the failure
ledger, semantic errors, fixture ambiguities, and proposed versioned repair.

The independently reviewed v2 corpus is also frozen and its first execution fails
the same relevance gate: 174/174 database cases completed, required-evidence recall
is 100% in every class/run, exact quotations are 36/36, and forbidden-record and
revoked-session checks pass. Zero-extra-ID rejection is 165/174 (94.8276%), below
95%. Nine results across four questions add irrelevant evidence. This is a failure,
not a rounded pass. The raw selector decisions and actual database replay are
preserved in `tests/fixtures/retrieval/provider-selections-v2.json` and
`tests/fixtures/retrieval/evidence/database-quality-v2.json`. No final-answer
provider calls were started for this failed candidate. V2 is not an apples-to-apples
improvement claim over v1, whose known fixture ambiguities and failures remain
recorded. Neither corpus may be relabeled to match model output.

The real authenticated browser journey saved and later retrieved a highlight,
attached note and reflection, reopened the existing reader, and downloaded a
verified export containing them. It preceded the final worker/session fixes and
is not final-build sign-off. Its answer also misattributed note wording to the
highlight. A subsequent development prompt correction removed that specific
misattribution in three runs, but two still inferred an unsupported connection.
Those raw results are retained; full answer-quality and token gates remain open.

A later local production-build smoke verifies real ordinary-account chat entry,
same-session token refresh preserving an unsent draft, sign-out clearing access,
and an empty worker releasing its durable lease. Its exact file hashes are in
`tests/fixtures/retrieval/evidence/final-build-auth-worker-smoke-v1.json`.
It does not establish retrieval quality. Subsequent prompt/model changes require
their own quality evidence.

No production migration, deployment, or release approval is recorded here.
The scheduled snapshot-maintenance failure remains explicitly deferred.


## Accepted answer boundary — implementation and verification in progress

The recommended first-release alternative is concise, attributed evidence extracts.
Keep the verified retrieval, selection, eight-record/4,000-byte composition bound,
and deterministic exact-quote/no-evidence branches. For matched evidence, a shared
server renderer would display the already selected authoritative field spans with
fixed editorial/highlight/attached-note/reflection labels. Reflection prompts would
not be presented as answer facts. No final model-authored factual prose, causal
recap, or inferred recommendation would be delivered. This avoids adding a second
verification model or another provider call.

This is a capability tradeoff, not an equivalent prompt fix: comparisons can show
the requested records side by side, but conversational synthesis and novel
inferences would be deferred. Relevance and requested-facet completeness still
need independent evaluation. The benchmark adapter must assess the actual served
extracts across all three recorded selector runs and require independent review;
zero final-generation calls must not silently remove the answer-quality gate.
The current corpus, thresholds, failed outputs, and attribution requirements stay
unchanged. The user accepted this alternative on 26 September 2026. The continuation above records implementation and verification; approval of the product direction is not release approval.

A paid hosted rehearsal has not run. Its unused private preparation directory was
removed; no hosted project was created. The recorded read-only preflight is not a
hosted release pass. Production remains unchanged. The response-design decision is now approved; the hosted-project price acknowledgment remains pending.

## User-visible behavior

Ask These Notes searches the complete server-authorized Notes filter, including
reflection-only scopes. Ask My Library can combine current editorial passages
with highlights, written notes, and reflections. A written disagreement remains
separate from the source text. Exact personal quotation returns the stored field;
it is not reconstructed by the language model. Citation validation and the new
exact-passage navigation experience remain workstream #5.

The client sends declarative filters, not the IDs it happens to have loaded.
Malformed filters disable the scoped composer instead of widening the search.
Chat storage belongs to the verified account and Auth session. Logout or session
replacement stops the old chat; routine refresh and same-session sign-in events
preserve it. Old ID-based links require restarting with a current scope.

Explicit follow-ups can use a bounded chain of prior user questions to identify
the topic. Assistant replies never supply stored evidence. If the topic was
introduced only by the assistant, or the bounded user context cannot identify it,
the route asks for clarification before paid retrieval. A fresh question is not
combined with unrelated conversation history.

Notes comparison and synthesis use the same configurable complex Anthropic model
as Library synthesis; simple Notes recall retains the standard model. This follows
a recorded development comparison: independent AI review found correct attribution
in three Sonnet answers versus one of three Haiku answers for the same synthetic
question. This small development result is not a general quality claim. Exact
quotations remain deterministic stored text. The model choice increases the cost
of complex Notes answers; measured token use is retained with the evaluation.

## Retrieval and indexing

A private index stores Gemini 768-dimensional vectors and UTF-16 field offsets.
It stores no duplicate note text. Capture changes invalidate vectors in the same
database transaction; capture/account deletion cascades to index state and chunks.
Source availability is checked against live data. A withdrawn editorial source
can leave an owned personal capture available without providing a current source
excerpt or validated reader link.

The ordinary-account search function derives the account and session from Auth,
checks live session existence, applies the complete scope, and requires every
eligible capture to be indexed. It computes exact cosine rankings over all
eligible chunks before taking at most 32 highlights/notes and 32 reflections.
Library retrieval adds at most 32 current editorial passages. These intermediate
windows are balanced by evidence class so one class cannot crowd another out.
A shared semantic selector chooses at most eight useful items across that pool;
vector similarity alone is not treated as evidence that a passage answers the question. Reflection prompts cannot
qualify an unrelated reflection answer. The best span of each relevant field is
retained, including a written note accompanying a highlight.

The server fetches only these bounded personal candidates through ordinary-account RLS,
verifies span bounds, rechecks the live values and index revisions, and verifies
Auth again before generation. Deleted or superseded records are never recovered
from assistant history or an export snapshot. Incomplete indexing and provider or
database failures are explicit retryable failures, never successful empty results.

The selector receives complete candidate span blocks, bounded to 96 candidates and
256 KiB including titles/field labels. It has a 20-second deadline, 1,600 output-token
limit, no automatic retry or request-time provider fallback, and may return no
relevant evidence. Its IDs are validated against the authorized input. Provider
failure is an explicit retrieval failure, never an empty answer. Exact quotation
uses semantic target selection followed by the stored field, not generated wording.
Selector input/usage is a separate intermediate cost from the final answer budget.
The v4 candidate uses one structured relevance-assessment call. It identifies the
requested facets, briefly assesses support and constraints, and derives IDs only
from direct-support verdicts. These generated assessments are internal judgments:
they are neither stored evidence nor passed to answer generation or the client.
Unknown/duplicate IDs and malformed output fail explicitly. Internal strings have
a 2,000-character bound; the model's total output limit and eight-assessment limit
remain enforced. This replaces an ID-only response, not authorization checks.

This design was selected through separate development probes. A strict quotation-
witness variant was rejected after only 12/18 valid responses. The simpler variant
made the expected selections in all 21 raw responses, including three eight-record
comparisons, but its initial short-string schema rejected one 351-character
explanation. All 21 saved responses conform under the documented larger string
bounds; that offline check made no provider calls and is not a benchmark pass.
The original 20/21 validated result remains preserved. Subsequent exact-configuration
execution completed 168 selector calls without retries or failures (1,056,615 input
and 32,693 output tokens). The unchanged frozen retrieval gates passed as recorded
above; final-answer gates remain separate.

Retrieval requests record one admitted AI usage event before paid provider work,
including quotations, abstentions, cancellation, and failed attempts. Generation
does not charge the same retrieval request again. Existing quota checking and
admission are not an atomic reservation; this change does not claim to resolve
that separate concurrency limitation. Final delivery checks the live Auth session
through the database guard as well as the current account.

The answer context currently uses a conservative 4,000 UTF-8-byte ceiling and
whole evidence blocks. This is not a measured token count. The frozen benchmark
must also report actual provider token counts against the approved 4,000-token
budget. The shared limit is eight evidence items across personal and editorial
classes. Large exact quotes are refused instead of clipped.

## Background worker and limits

The worker uses the existing server-only service credential and Gemini key.
Private service RPCs enforce signed service-role claims, bounded leases, revision
fencing, complete field coverage, and current capture existence. Ordinary accounts
cannot execute worker operations or read any private index table.

A token-fenced 90-second worker lease lives in the private provider singleton,
independently of capture rows. Editing/deleting a claimed capture cannot admit a
second worker while its provider call is in flight. A short finally block releases
only that invocation’s token; expired or replaced tokens cannot claim or release
another invocation. Per-capture revision/lease checks still fence publication.

Each invocation has a 40-second processing budget, at most 20 captures, and serial
embedding requests with at most two inputs. Each capture has a 64-KiB/64-chunk
bound. A separate private singleton preserves provider cooldown across capture
edits/deletions. HTTP 429 respects the provider delay and does not exhaust a
capture's poison-record retry budget. Other repeated failures become explicit
failed indexing and require operator investigation; do not silently mark them
ready or discard their scope membership.

The five-minute scheduled job calls the canonical `www.netflux.blog` protected
endpoint. Initial release backfill must be drained and verified before enabling
the new application path. Subsequent saves can remain pending until a worker run;
GitHub schedule delays can extend that interval. No instant-indexing claim is made.
The separate, previously deferred snapshot-maintenance job is outside this change.

## Why the initial approach changed

The first implementation embedded every eligible personal record on a cold query.
A real synthetic 1,201-record probe returned HTTP 429 during its first four batches
of 100 inputs. A later two-input diagnostic succeeded. This establishes neither
the exact quota nor that concurrency caused the failure. It does establish that
the large-query release condition was unproven. The shipped candidate must use
persistent indexing rather than rely on warm process memory to hide that problem.
A second, actual-database diagnostic with real provider vectors found poor
relevance and exact-quote target selection. The semantic selector addresses this
separately; neutral-title development probes guard against relying on fixture
titles. These failed diagnostics are not discarded or presented as release passes.
The failed cold-embedding probe is retained in `tests/fixtures/retrieval/development-probe.json`.

## Verification and rollout

The frozen 58-case corpus and executed historical structural baseline are recorded
under `tests/fixtures/retrieval/`. Structural mocks are not model-quality or real
Auth proof. Provider-vector diagnostics, actual database queries, three generation
runs, model token counts, and answer adjudication must be distinguished in evidence.
No release pass may be inferred from a unit-test total.

Before release, require the existing disposable-database runtime suite plus the
new index lifecycle/authorization cases; fixed-corpus quality thresholds without
holdout tuning; large-scope indexed query measurements; and an authenticated
capture → later retrieval → existing evidence view → export journey. Run the
repository database-facing production release gate for the single new migration.
Apply before app deployment, complete the initial backfill, then confirm normal
and revoked-session behavior through the deployed endpoints. No production
migration is recorded as applied in this document.

## Separately observed existing durability defect

Disposable journey cleanup found that deleting an Auth account with library rows
can fail: `private.advance_user_library_revision_on_delete` tries to insert
`account_library_state` for the account being deleted, violating its foreign key.
The fixture was cleaned by removing its own library rows before deleting its Auth
account. This workaround is not a production fix or account-deletion acceptance
pass. Track the defect in the parallel durability workstream; it was not silently
added to this retrieval migration.


## Citation implementation checkpoint — 26 September 2026

Workstream #5 was implemented on `codex/validated-evidence-citations`, isolated at
`/Users/j/Desktop/Lifebook-citations`, based on deployed `ff475093` (#156).
No database migration is planned. References are account-bound, encrypted,
24-hour tokens issued only for the final selected response set, using a
purpose-derived key from the existing server-only cursor secret. No model creates
citation targets. UI message metadata carries links separately from exact text.

The dedicated `/evidence` view rechecks live authentication and ordinary RLS
ownership, and marks the exact stored field slice with surrounding context.
Changed editorial text is not reconstructed; deleted captures/cleared fields serve
no old excerpts. Still-owned personal context can remain visible with an explicit
changed/withdrawn label. A secondary reader link opens the source, not an
unverified historical reader offset. Full editorial revision history is deferred.

Implementation and local verification completed; #158 subsequently merged and deployed. See the production closeout below.
The opaque reference survives reloads in history state; personal data is never
stored there. Visibility changes invalidate pending reads synchronously. Exact quotations also carry a literal-rendering marker so Markdown syntax cannot
turn stored punctuation into formatting or links. Response
text, selector prompts, embedding/ranking inputs and model choices are unchanged;
no model-quality rerun was required.

Evidence: full unit run 1,416 passed (221 configuration-dependent
skips at that checkpoint); subsequent affected tests cover Notes UI-stream
metadata and hidden-page cancellation. The two new disposable Supabase cases
exercise actual RLS/lifecycle changes and an actually revoked Auth session.
Chromium desktop and WebKit mobile pass exact-text rendering, keyboard focus,
200% text sizing without horizontal overflow, and no content after cookie removal.
The browser fixture is synthetic; the browser suite requires
`CITATION_BROWSER_FIXTURE` and a loopback `PLAYWRIGHT_BASE_URL`, and is not
silently counted as default CI browser coverage. No production data was used.

One bounded reviewer caught exact-quote identity loss at the composition limit,
Strict Mode reference loss, and a hidden-page late-response race; each was fixed
with regression coverage. Browser evidence also drove opaque-reference retention
across remounts. Full lint and the affected regression tests passed after corrections. The
final rebased production build and required CI checks passed before #158 merged. No migration, production configuration or production action in this change.


To reproduce citation browser proof, start the app against a migrated loopback
Supabase with the existing DB107 variables and a local cursor secret of at least
32 characters. Set `CITATION_BROWSER_FIXTURE` to a private temporary JSON path;
run `NODE_OPTIONS=--conditions=react-server npx tsx scripts/citation-browser-fixture.ts create`,
then `PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test tests/e2e/evidence-citations.spec.ts --project=desktop-chromium --workers=1`.
This runs Chromium and WebKit explicitly. Finish with the same fixture script's
`cleanup` command. Never commit the fixture: it contains disposable login cookies.


## Citation closeout and deletion-fix checkpoint — 26 September 2026

#158 merged as `610724e2` and successfully deployed. The current production build
`820fe7b7` passed the authenticated HTTP citation journey described in
[STATUS.md](STATUS.md#citation-production-closeout--26-september-2026). The synthetic
capture and temporary account were cleaned up. This establishes deployed quote,
reference, deletion and revocation behavior; it does not claim a new full browser
or later-session/export acceptance pass.

Next bounded correction: the documented account-deletion/revision-trigger defect.
Branch `codex/account-deletion-closeout`, isolated worktree
`/Users/j/Desktop/Lifebook-account-deletion`, base `820fe7b7`. One agent owns the
migration and real database/Auth regressions; the coordinator owns release proof
and register reconciliation. Docker was stopped at entry; starting it restored the existing disposable stack
without a reset. The original defect reproduced as Auth delete HTTP 500 with the
account-state FK failure. Candidate migration
`20260926150259_account_deletion_library_revision.sql` first advances existing state,
then repairs missing state only for a still-live, key-share-locked account.

The focused regression and all 20 affected database runtime tests pass. Coverage
includes real Auth deletion, capture/state/index cleanup, account isolation,
concurrent ordinary deletions, missing-state recovery, and source-deletion revision
updates. Typecheck, focused lint, diff and direct function-ACL checks pass. The
local advisor CLI connection failed despite successful direct database checks;
hosted advisor proof is still required. No production schema change has occurred.

Production read-only dry-run proposes exactly the migration above. The latest
completed production backup is `2026-09-25T23:45:02.269Z`. The user approved the
$10/month temporary-project cost; isolated candidate `disbfndyhfrwsdggxnsy` is
being verified in `/private/tmp/netflux-deletion-hosted/candidate`, distinct from
production `xmuqsgfxuaaophxnwure`. No production migration has been applied.
The PR remains held until hosted replay, security/advisor/type/schema checks and
application smoke pass. Next: finish that gate, apply the reviewed one-migration
production release, then delete the candidate and private credentials. Do not
rerun unchanged model benchmarks.


### Deletion repair release result

PR [#161](https://github.com/Jseow008/ThePlayBook/pull/161), implementation
`71493b37`, completes the bounded fix. The user approved the temporary project's
quoted cost. Full hosted replay/reset, 106 immutable migrations, six security
checks, DB-002 behavior, type comparison, build and all seven browser smoke
checks pass. Hosted real Auth deletion removes all five tested capture/state/index
collections. Before production, the only schema difference was the intended
trigger body.

The single reviewed migration is applied to production under the user's existing
production authorization. Post-apply parity/recorded SQL, clean dry-run, all 14
schema categories and all six security checks pass. A real temporary ordinary
account saved a library item, note and reflection, then Auth deletion succeeded
and removed its public capture/state rows. Health is `ok`. Advisors show no new
findings; existing public-search and leaked-password warnings retain their owners.

The temporary hosted project was deleted and its absence confirmed. The isolated
application was stopped; synthetic accounts were removed. Private credentials and
workdir are removed after the sanitized evidence is retained. No production
content or existing personal data was changed. Setup retries were one dependency
symlink correction and one local HTTP proxy-header correction, not product fixes
or weakened assertions. No model benchmark or prompt tuning was repeated.

[Release evidence](../tests/fixtures/retrieval/evidence/account-deletion-release-20260926.json).
Next: finish required PR checks and merge #161; the migration is already applied
and must not be reapplied. Broader durability and AI safeguards remain separately
scoped work.

## Finding #8 — stale library writes, 26 September 2026

Owner: Codex implementing for the repository owner. Target: this bounded release;
production remains gated by hosted verification and required CI.
PR [#162](https://github.com/Jseow008/ThePlayBook/pull/162), implementation
`08307d9a`, is open and held with auto-merge off. Rebased onto merged #161
(`eca07ef4`); only the shared checkpoint needed conflict reconciliation.
Branch `codex/library-stale-write-guard`, worktree
`/Users/j/Desktop/Lifebook-library-durability`.

Confirmed gap: the old mutation route accepted unconditional upserts without a
base revision or reset epoch. Its original SQL reproduced resurrection after an
absent-row removal in a rolled-back disposable transaction. Legacy bookmark
routes and browser table write grants bypassed the authoritative path too.

The candidate requires the expected account, exact account-wide base revision,
and reset epoch. A shared account lock serializes writes and resets. Even an
absent-row removal advances the durable account boundary. Browser DML is revoked;
the unused legacy bookmark routes reject with authenticated 428. The current
client serializes its own writes and chains only its own successful acknowledgements.
Conflicts and unconfirmed writes stop the chain and show a refresh action; they
are never automatically rebased or replayed. Saves before initial hydration are
not submitted. Save-success feedback waits for acknowledgement.

The account-wide boundary is deliberately conservative: a different device's
change to another item can also require refresh. No new tombstone table is needed
because the account revision survives removal. Client failure records are still
memory-only; durable retry IDs, offline persistence and guest migration are #9,
not claimed here. Reset/account changes invalidate older queued actions and late
responses; a newer reset snapshot never overlays old pending saves.

Evidence: baseline original SQL reproduced the defect (not a complete historical
application build). Five new focused database fixtures and all 26 snapshot runtime
tests passed on the existing loopback disposable stack. Full local unit suite:
1,439 passed, 227 configuration-dependent skips. Final reset/feedback checks:
27 passed; final typecheck and targeted lint pass. CI is running. One reused bounded reviewer found a
hanging pre-reset request could block post-reset actions; fixed by detaching the
old queue, with regression coverage. No model benchmark or tuning run was needed.

Candidate migration: `20260926153219_guard_library_mutation_boundary.sql`.
The user approved the short-lived hosted project at $10/month. Candidate
`genspcayrpwbgekyzyph` passed full replay/reset, six security checks, type/schema
comparison, seven standard smoke checks, and the real browser conflict/refresh/reset
journey. Production has not received this migration. Next: final required CI,
apply exactly the reviewed ACL migration, then deploy and prove the new route. ACL revocation alone does not fix the old server route;
do not claim #8 live before the new app is deployed. Existing open browser tabs
must refresh to send the new contract. Preserve required CI and production gates.

CI correction: the full RLS SQL fixture still expected owner browser writes. It now
requires permission denial for own/other-row DML and TRUNCATE while retaining
SELECT isolation. The complete RLS, snapshot-worker, new-object and vector SQL
fixtures pass locally, as do five RLS unit tests. No grants were restored.

Hosted browser follow-up, 27 September: kept Save loading until the server boundary
is available. A same-account auth update was also cancelling pending hydration
without starting a replacement; the new deterministic test reproduced it before
fixing cancellation to occur on unmount/account changes. The real hosted browser
journey now passes with no retry. Candidate worker TLS uses the official Supabase
CA with verification enabled. No production environment setting was changed.
[Sanitized release evidence](../tests/fixtures/retrieval/evidence/library-stale-write-release-20260927.json).
Final local verification: 1,442 tests passed, 229 configuration-dependent skips;
typecheck and targeted lint passed. The database/runtime code is unchanged from
the passing 26-fixture run. Final CI remains required before production.

### Production rollout checkpoint — 27 September 2026

#162 merged as `e3182888a370da1a0a927f222f034f7e5a5dff25`; all required
checks passed on `2d44e90e` (1,442 unit, 26 snapshot runtime, 174 browser tests;
229 unit and 114 browser configuration/scope skips). Production received only
`20260926153219_guard_library_mutation_boundary.sql`. All 107 recorded migration
SQLs and 14 schema fingerprint categories match; the post-apply dry-run is clean
and all six security checks pass. Advisors show no new findings.

The pre-release JSON above is frozen rehearsal evidence; this closeout supersedes
its pending production/cleanup fields. Hosted candidate `genspcayrpwbgekyzyph`
was deleted and its absence confirmed. Candidate credentials/workdir, generated types and remaining private fixtures were removed;
the isolated application is stopped. No error-level runtime logs were returned for
the new deployment during closeout.
Vercel production deployment `dpl_GQ7nSntJhxezJMHyPmsSezJLVE3j` is READY and
`www.netflux.blog` resolves to `e3182888`. The first guarded smoke attempt ran before
the custom-domain switch, received legacy HTTP 400 instead of 428, and stopped
before library writes; its temporary Auth account was removed. After post-merge CI
passed and the domain switched, the complete synthetic ordinary-account proof passed:

| Production check | Result |
| --- | --- |
| Legacy bookmark path requires refresh | 428 |
| Fresh save and removal | 200 / 200 |
| Old save after removal | 409; no row resurrected |
| Reset and old-epoch replay | 200 / 409 |
| Fresh save after reset | 200 |
| Direct authenticated browser UPDATE | Permission denied, 42501 |
| Wrong expected account | 409 |
| Synthetic Auth account deletion | Passed |
| Public health | `ok` |

No existing personal records or public content were changed. The hosted real-browser
journey separately proved initial loading, conflict feedback, explicit refresh, and
successful fresh Save. Production proof is authenticated HTTP, not a claim that every
browser viewport was retested live. Local main was fast-forwarded to the merged code.
Finding #8's stale-bookmark non-resurrection acceptance is delivered. Account-wide
conflicts remain conservative; users with old open tabs must refresh. Durable offline
queue, idempotent retry and guest migration remain #9.

Run accounting: approximately one hour including release waiting, one bounded reused
subagent for the RLS fixture correction, no model benchmark/prompt tuning. The final
PR validation took 15m58s, including 9.3m of serial browser tests, and production aliases
waited for a second main-branch validation. Hosted browser retries exposed a verified-TLS
setup issue and two related hydration problems; the latter have regression coverage.
Token usage and a comparable prior-run duration are unavailable; no measured token-saving
claim is made. Future CI-policy changes must be separately scoped, not bypassed here.

Closeout branch `codex/library-stale-write-closeout` in
`/Users/j/Desktop/Lifebook-library-durability` records this receipt only. Next workstream:
#9 durability; do not reapply this migration or repeat the completed hosted rehearsal.

## Finding #9 — library recovery implementation, 27 September 2026

Implemented in [#164](https://github.com/Jseow008/ThePlayBook/pull/164), merged as
`d17d8c4d` from `codex/library-recovery` at `ec7e1006`, based on freshly fetched
`9dae0eae`. One bounded server implementer also provided a read-only client review;
the coordinator owned client recovery, UI, integration, and release. Current release
state is recorded in the checkpoint below.

Scope: the existing guest/offline library surfaces (bookmarks and reading progress).
Guest highlights/reflections do not exist today; this does not claim a new offline
note/reflection editor. Authenticated library intents have immutable IDs, account,
base revision/reset epoch, stable timestamps, and a request frozen before sending.
Per-intent browser records survive reload; account switching cancels delivery and
never transfers another account's queue. Network uncertainty remains pending;
conflicts require explicit refresh/review. Corrupt or unavailable storage is visible.

Server receipts commit atomically with writes under the existing account lock.
Retries return the original outcome; changed payloads with the same ID reject.
Receipt scope is account/reset epoch: reset supersedes older operations and clears
receipts; unchanged old requests still reject by epoch before receipt lookup.
Each account/epoch admits at most 100,000 receipts, with existing retries allowed
at the cap. Requests are bounded to 64 KiB. Private worker RLS and browser denial
apply; account deletion cascades. Migration:
`20260927035548_library_mutation_receipts.sql`. Early development used the existing
disposable `supabase_db_netflux-pr153-browser-cbrcdq` without resetting or stopping
that stack. Final local and CI runtime proof executed all 31 tests, including real
Auth revocation; hosted proof exercised all 30 applicable database cases.

Guest import is explicit in Settings, at most 200 captures per batch. The whole
batch is queued before delivery, with one migration ID and stable source identities.
Existing authenticated items are skipped and retained for review, never overwritten.
Acknowledged guest sources are removed locally only if unchanged; interrupted local
cleanup resumes. Discard releases the source's destination binding. Reset discards
queued guest sources assigned to that account only when the original source is still
unchanged. Unassigned guest data remains separate. Browser journal admission is
1,000 stored intents; overflow is visible and does not submit an unpersisted write.

Client review found and corrected: guest reapply dropping import protection; skipped
sources blocking later eligible sources; interrupted acknowledged-source cleanup;
and discarded imports retaining an unusable account binding. Frozen requests are
validated against their displayed intent. Interrupted imports no longer start a
competing snapshot while writes remain pending; the browser rehearsal exposed that
race and a deterministic interrupted-batch fixture covers it.

Validation so far: full local suite 1,461 passed / 234 environment-dependent skips
before the final small journal/hook corrections; affected hook suite now 33 passed,
journal suite 5 passed, Settings suite 2 passed. Typecheck, targeted lint and the
candidate production build passed. Database runtime: 31/31 local with real Supabase
Auth revocation; 30/30 hosted applicable cases, with hosted Auth sign-up excluded
because that fixture uses a reserved synthetic domain. Hosted per-test timeout was
30 seconds to accommodate remote round trips; application deadlines were unchanged.
Initial hosted 5-second harness timeouts were recorded and resolved by this explicit
harness setting, not by changing production behavior.

Approved temporary candidate: `bzhvoizhcjtqlkjfmqls`, distinct from production
`xmuqsgfxuaaophxnwure`, created in the existing organization at the approved $10/month
rate. All 108 migrations replayed, guarded reset and final dry-run passed. Six SQL
security gates passed. The schema fingerprint now includes `snapshot_private` (it
previously omitted that schema); comparison finds only the two new receipt tables
and their intended definitions/ACLs. Public generated types match production.
Candidate advisors show the existing intentional search-function warnings and private
RLS informational findings, plus unused indexes on synthetic data; no new receipt
ACL warning. Seven production-build smoke checks passed after supplying the isolated
harness's admin IP and forwarded-host configuration.

Production pre-apply gate: completed backup at `2026-09-26T23:45:27.973Z`; exact dry-run
proposed only `20260927035548_library_mutation_receipts.sql`. Real hosted browser proof passed: explicit guest import,
server commit with deliberately lost response, identical replay after reload without
duplicate receipt/write, remaining-batch completion, offline save/reconnect, and
375px/1440px Settings rendering with no uncaught browser errors or horizontal overflow.
The reviewed migration and PR have subsequently shipped; deployment verification is
tracked below. No model evaluation or additional subagent was needed.

### Finding #9 release checkpoint — 27 September 2026

PR [#164](https://github.com/Jseow008/ThePlayBook/pull/164) merged as
`d17d8c4d81282f0a9db371a8ba91b655cac23cb4` from reviewed head `ec7e1006`.
Required exact-head CI passed: 1,464 unit tests, 31 recovery database tests, and
174 browser tests (114 declared browser skips; zero reported flaky retries).
Production received only `20260927035548_library_mutation_receipts.sql`; all 108
migration versions and recorded SQL match. Expanded schema parity, all six security
gates, and clean post-apply dry-run passed. Existing advisors are unchanged: intentional
search-function warnings, private RLS informational findings, disabled leaked-password
protection, unused indexes and Auth connection-allocation information.

Temporary candidate `bzhvoizhcjtqlkjfmqls` was deleted immediately after rehearsal;
absence was confirmed and candidate credentials/sessions were removed. Synthetic
hosted records were deleted with the project. The isolated app process was stopped.

Production is verified live at `d17d8c4d`, Vercel deployment
`dpl_ADp2Mbp3jVAxJBwD6esuHqh7vTec`, on `www.netflux.blog` (27 September 2026).
Merged-main CI and security checks passed. The merged application tree is identical
to the verified PR head; unchanged tests were not rerun locally.

The live browser smoke used one temporary ordinary account and an existing public
source. Settings offered explicit guest import, the item saved successfully, two
identical mutation retries returned the same acknowledgement, a changed payload
using the same ID returned 409, and the account had exactly one saved row. The
session was revoked and the account and owned data deleted afterward. Health returned
`ok`. No existing personal data or public content was modified.

Finding #9 is delivered for the existing bookmark/progress surfaces. Guest/offline
note or reflection authoring remains outside this scope. Local `main` was pulled to
the merged release. This closeout is documentation only: do not reapply the migration,
recreate the deleted candidate, or rerun unchanged model benchmarks. Remaining work
retains its individual gates in the 32-finding register.

### Finding #20 implementation checkpoint — 27 September 2026

PR [#166](https://github.com/Jseow008/ThePlayBook/pull/166) merged as
`00c0471ed24837322291d7b7cfb20c57ae94e851`, from reviewed head
`91392cb5435a3e7a21f83833fd8e231de098c85b`, at 06:03:30 UTC.
Worktree: `/Users/j/.codex/worktrees/ai-quota-admission/Lifebook`; implementation
branch: `codex/ai-quota-admission`, based on freshly fetched `24d735e0`.

Scope: authenticated quota admission across Ask My Library, Ask These Notes, and
Author Chat. A service-role-only, security-invoker RPC serializes each account's
UTC day/week/month count and usage insertion. Existing inserts take the same lock
for rollout compatibility. Requests admit once before their first provider phase;
stream completion no longer controls accounting. Defaults remain 20/day, 100/week,
and 300/month, with validated server-side overrides and the existing 429 response.

The quota counts dispatch attempts. Admitted failures/cancellations retain their
unit; a lost acknowledgement or crash between commit and dispatch can conservatively
consume a unit without a provider call. An ambiguous admission fails closed without
automatic retry. This is not provider billing. Fixed clarifications/stored answers
that bypass providers also bypass admission. See OPS 3.6 for accounting and rollback.
#21 identity/burst consistency and #22 global/guest budgets remain separate.
Retrieval prompts, models, ranking, citations, and UI are unchanged.

Evidence:
- Local: 87 focused tests, 1,469 full-suite tests (246 declared skips), 12 separate
  database tests, all six SQL security gates, lint, typecheck, and production build.
- Exact-head CI: 1,469 unit tests; 12 quota DB tests; 31 snapshot DB tests; 173 browser
  tests (113 declared skips). Security, catalog evidence, PR scope, and Vercel passed.
- Hosted candidate: full 109-migration replay, guarded reset, clean dry-run, six SQL
  security gates, DB-002 preservation proof, 12 quota runtime tests, and seven app
  smoke checks. Production-adapter/Data API concurrency admits exactly one final
  unit. All three authenticated app routes return 429/Retry-After when exhausted,
  without additional usage or provider dispatch.
- Reviewed schema delta: two functions, one service-only function ACL, and one
  insert trigger; no removals. Generated API types add only the matching RPC,
  preserving existing app aliases and nullable email-RPC overrides.

Production received only `20260927053554_atomic_ai_quota_admission.sql`. All 109
migration versions are verified; old recorded SQL is unchanged and the new recorded
SQL matches the candidate. Post-apply parsed schema fingerprints match in every
category; six SQL security gates and the final dry-run pass. Backup completed at
`2026-09-26T23:45:27.973Z`. Existing advisors remain: intentional catalog-search
warnings, private RLS informational findings, disabled leaked-password protection,
unused-index information, and Auth connection-allocation information.

The user approved the temporary project's quoted $10/month rate. Candidate
`fcstnortxhgddgadaqat` was deleted and its absence confirmed. Its isolated app server
was stopped and candidate credentials removed. One implementing agent; no new model
or provider evaluation calls. Verification-harness corrections concerned historical
SQL comment/statement packaging, old procedural formatting, generated type formatting,
and JSON property order. No production implementation rewrite was needed; quoted SQL
values and procedural delimiters were preserved during review.

Production is verified live at `00c0471ed24837322291d7b7cfb20c57ae94e851`, Vercel
deployment `dpl_6aNq77oXdCJr6u2VtiLx6tgh1cjG`, on `www.netflux.blog`. After a
60-second drain window, a temporary ordinary account received the expected
429/Retry-After from all three chat routes. Denied requests did not add usage;
anonymous admission-RPC access was rejected; public health returned `ok`. The
synthetic session was revoked, the account deleted, and its usage cleanup verified.
No existing user data was modified.

Merged-main CI attempt 1 failed five mobile `/browse` navigations. All five traces
showed the same unfinished optimized-logo request while page/JS responses completed.
The image/configuration was unchanged by #166 and production served both PNG and
browser-negotiated WebP successfully. One fresh-runner retry passed: 175 browser
tests, 113 declared skips, no reported flaky tests. No tests, deadlines, or application
code were changed to obtain that result. The failed evidence was retained in the
GitHub run, rather than treating the failure as a quota regression.

Finding #20 is delivered for authenticated account quotas. This closeout is
documentation only: do not reapply the migration, recreate the deleted candidate,
or rerun unchanged model benchmarks. Private release artifacts and credentials are
removed after closeout preparation. Next bounded workstream is #21's consistent
trusted identity and burst-rate enforcement; #22 global/guest budgets remains
separately open.

## Finding #21 implementation checkpoint — 27 September 2026

PR [#168](https://github.com/Jseow008/ThePlayBook/pull/168), reviewed head
`d6752da6ccf43a874039246ee240b84970521986`, merged as
`450fb8793cf341d953d2a9616bc97ac0d302d0af`.

Implemented one AI identity/burst policy: account-only 10/minute per route,
canonical trusted Vercel network identity, existing guest 3/10-minute protection,
and a separate shared network 60/minute abuse bucket. Missing trusted identity and
Redis errors/timeouts fail closed. Author authentication failures are not silently
converted into guest requests. No migration, provider/model, retrieval, or UI change.
The generic limiter adds explicit shared scope and rejects timeout-success; existing
non-AI identity selection is outside this focused change. OPS 3.7 records the policy,
shared-network tradeoff, hosting assumption, and rollback.

Evidence:
- PR CI: 1,501 unit tests passed (246 declared skips), 175 browser tests passed
  (113 declared skips), lint/typecheck/build, Security Validation, catalog checks,
  PR scope, and Vercel all passed. No failed CI attempt or rerun.
- Hosted preview `dpl_DLSB2NLTuzYgV41maCFz2ybLAL1F` at the reviewed head:
  63 requests in 40,737 ms; 36 expected `400 INVALID_JSON` and 27 expected
  `429 RATE_LIMITED` outcomes. Forged forwarding headers did not reset guest or
  account limits. A second account retained its separate allowance until the
  shared network bucket blocked it on all three routes. Every denial had a
  positive Retry-After. The committed verification script defines the assertions.
- No provider calls or quota usage. Two disposable ordinary accounts were globally
  revoked/deleted and usage cleanup verified. No existing account data changed.
- DNS points `www.netflux.blog` directly to Vercel; the project exposes system envs.
  Vercel's injected-header contract is linked in OPS and behavior is verified on
  the hosted preview, rather than inferred from local header mocks.

One implementing agent; no database project/replay or model evaluation. Two initial
unit-fixture corrections concerned the repository's browser-based setup and standard
Headers whitespace normalization. The CLI credential refreshed normally for preview
access; no deployment protection was disabled. Implementation did not change after
its first hosted proof. Release waiting is CI/platform time, not repeated experiments.

Production is verified at `450fb8793cf341d953d2a9616bc97ac0d302d0af`, deployment
`dpl_DQVN8CuhVpen8pi239E1Nppr3WYZ`, on `www.netflux.blog`. The same 63-request
proof passed in 40,378 ms: 36 expected malformed-body rejections and 27 rate-limit
rejections. An additional public request without deployment-bypass credentials,
with forged forwarding headers, also returned 429 and a positive Retry-After.
Two new disposable accounts had zero AI usage, were globally revoked/deleted, and
passed cleanup verification. Public health returned `ok`. No existing user data,
production environment settings, database schema, or provider settings changed.

Merged-main [validation](https://github.com/Jseow008/ThePlayBook/actions/runs/36304479507)
and [security](https://github.com/Jseow008/ThePlayBook/actions/runs/36304479532)
passed on the first attempt. Main browser evidence: 175 passed, 113 declared skips.
PR creation to production readiness was about 35 minutes, dominated by the existing
PR and merged-main CI gates; no code changes or reruns occurred during that interval.
One implementing agent; Codex token usage is not available as a reliable isolated
measurement. Private credential copies and release helpers were removed at closeout.

Closeout worktree: `/Users/j/.codex/worktrees/ai-trusted-rate-limits/Lifebook`, branch
`codex/ai-rate-release-closeout`, from merged `450fb879`. This closeout changes only
documentation. Finding #21 is delivered for the three interactive AI routes; #22
(global/guest budgets, provider-spend controls and kill switch) is the next bounded
workstream. Do not reapply #20's migration, recreate its deleted database candidate,
or rerun unchanged retrieval/model evidence.

## Finding #22 implementation checkpoint — 27 September 2026

Worktree `/Users/j/.codex/worktrees/ai-spending-controls/Lifebook`, branch
`codex/ai-spending-controls`, based on freshly fetched `99c32ac4`. SQL commits
`9e0c5bd7` and `94be1a6b` integrate the bounded ledger subagent's work. Application
integration is in progress; no PR, production migration, activation, or deployment yet.

Scope: the three interactive AI routes only. Every query/batch embedding, evidence
selector call and answer stream reserves global budget before provider dispatch.
Guests additionally share a monetary sub-cap and a per-network daily attempt quota.
Existing account quotas/rate controls, models, prompts and retrieval quality remain.
Provider retries are explicitly disabled on streams, matching the existing selector
and embedding behavior. Offline evaluations, indexing and admin generation remain
outside this interactive budget; this is not a cap on the entire provider invoice.

Policy starts disabled with zero monetary limits. User decision pending: daily USD
ceiling (offered $5/$10/$20). Proposed guest share: 20% of that ceiling, five attempts
per trusted network per UTC day. Do not activate by treating the preselected answer
or silence as approval. Configuration/kill-switch procedure is in OPS §5.4.1.

Reservations cover the model's full supported context plus configured output limit;
this is deliberately conservative, including when the remaining daily budget cannot
fit that reservation. Successful generation releases unused reserve only for valid
reported usage at reviewed list prices (including reported cache reads). Missing
usage, provider failure, disconnect and embedding calls retain their reserve. Gemini
Developer API embeddings do not reliably report billed usage. Unknown model pricing
fails closed. No account IDs, prompts, answers or source IDs enter the ledger; guest
network hashes and operation details have bounded 35-day retention. Daily aggregate
costs contain no user identity. Costs are USD list-price estimates, not invoices.

Evidence so far: 15 real database tests (concurrency, shared guest cap, quota, UTC-day
settlement, duplicate/replay rejection, emergency disable and ACL denial); 108 focused
route/adapter tests; four nested-provider boundary tests. Full local suite: 1,527 passed, 261 declared database/configuration skips.
Typecheck and lint pass; after the cache-read correction, all 113 focused
route/adapter/provider tests pass. Production build passes with placeholder public
configuration. No new paid provider/model evaluation is needed: prompts, models and
selection rules are unchanged. Existing frozen retrieval evidence is reused.

Corrections during development: local DB harness initially conflicted with shared
browser setup; nullable guest validation was corrected; review caught overspend
missing from aggregate counters (now charged exactly once before disabling, with
exact numeric counters to avoid overflow). Application review found cached-input
pricing was too conservative; reported cache reads now receive their reviewed tariff.
One test schema type mismatch was fixed using the production selector request builder.

Next: complete application checks, inspect scope and open held PR; obtain daily-cap
answer, perform OPS §2.2 hosted release rehearsal with fresh provider cost approval,
review production dry-run, then apply only this migration/configuration and release.
Do not repeat completed #20/#21 rollouts or unchanged model benchmarks.

Handoff: PR #170 is open at application commit
`375ae93b8d6b69dd03936b192f90d0b812ed994d`; GitHub file-list inspection and PR scope
passed, auto-merge is off. Required validation/security and Vercel checks were still
running at handoff. Fresh Supabase cost quote is $10/month in the existing Netflux
organization; explicit new-project approval has been requested, not yet received.
The daily-ceiling question also remains pending. No hosted project created and no
production changes. This checkpoint-only working-tree update will be included with
the next release-evidence commit; application evidence remains bound to `375ae93b`.

27 September follow-up: user approved the quoted $10/month temporary project in
Netflux's existing organization. The production daily ceiling is still unanswered.
At `375ae93b`, validate, PR scope, Catalog Search Evidence and Vercel passed. Security
Validation failed before runtime tests because the ACL checker had two top-level DO
statements and the CLI uses prepared queries. Consolidated the checks into one DO;
added prepared-query execution to the existing real-DB positive/negative ACL proof.
The actual CLI checker and all 15 runtime tests now pass locally (local CLI requires
`sslmode=disable`). No migration SQL or application behavior changed in this fix.
Next: push correction, finish approved hosted rehearsal, delete candidate, then wait
for daily-cap selection before any production activation.

## Finding #22 hosted rehearsal handoff — 27 September 2026

PR #170 corrected head: `b28ae64a06ed0b3e887e97ded3bf0f481ab9c82a`.
[Validation](https://github.com/Jseow008/ThePlayBook/actions/runs/36309634101),
[Security Gates](https://github.com/Jseow008/ThePlayBook/actions/runs/36309634094),
PR scope and Vercel all passed. Auto-merge remains off; no production mutation,
merge or deployment performed. Working-tree checkpoint is intentionally pending the
next release-evidence commit so recording status does not restart unchanged CI.

Approved temporary project `jpurfcadxkefukrqcxgq` completed full 110-migration replay,
guarded reset/replay and clean follow-up dry-run. Schema inventory comparison found
only #22's added objects, no removed or changed existing objects. Generated public
types differ from production only by the two spending RPCs and match the application
contract. Six hosted security checks passed. All 15 runtime tests passed with a
30-second per-test harness deadline for hosted round trips (application/SQL lock
limits unchanged). Initial hosted run passed 14/15; the many-invalid-inputs test
exceeded its local 5-second aggregate test deadline. All seven browser smoke checks
passed with zero retries on the corrected fixture setup. Initial browser setup had
5/7 pass: missing candidate admin-IP allowlist and localhost HTTPS redirect mismatch;
preflighted ingress/origin configuration corrected these without application edits.

Actual application requests against the hosted candidate returned disabled-policy
503 and zero-budget 429 with Retry-After. Both left zero admitted operations; no paid
provider work was dispatched. One active hourly `prune-ai-spend` job was verified.
Security advisors: expected service-only/RLS-no-policy INFO on four new private tables;
existing intentional search_catalog WARN exceptions unchanged. Performance findings
were unused indexes on the fresh database and its Auth connection-allocation INFO.

Setup notes: the new CLI's SQL endpoint cannot alter the privileged postgres role;
use the Management API database/password endpoint for the disposable project. The
existing CLI keychain credential used legacy base64 encoding. Supabase's official
root certificate was needed for a verified TLS pooler connection. No TLS verification
was disabled in the successful checks. Preserve these lessons to avoid repeating
credential/connection discovery on the next hosted rehearsal.

Temporary project deletion succeeded and absence from the project list was confirmed;
production remains listed. Stopped the isolated server and removed private credentials,
fixture data copies, candidate workdir and candidate-built application output. Safe
local evidence: `/private/tmp/netflux-pr170-evidence/` (summary, schema comparison,
hosted test summaries and dry-run). One primary agent performed this follow-up; no
subagents or provider/model benchmarks were started.

Production dry-run proposes exactly `20260927083746_add_ai_spend_ledger.sql`.
Remaining input: daily USD ceiling ($5/$10/$20 offered; proposed guest share 20%,
five attempts/network/day). Temporary-project approval did not answer the ceiling.
Next action after the ceiling is selected: refresh backup/parity and exact dry-run,
apply this sole migration under existing production authorization, configure approved
policy, verify production schema/ACLs, then merge/deploy and smoke-test. Do not recreate
the candidate or repeat unchanged hosted/model evidence without a relevant change.

Final CI log confirmation: 1,528 unit tests passed with 261 declared skips; 176
browser tests passed; Security Validation executed and passed all 15 spending
runtime tests on the corrected exact commit. No required check was bypassed.

## Finding #22 approved production policy — 27 September 2026

User explicitly approved $5/day global interactive allowance, including $1/day
shared guest allowance. Guest quota remains five requests/network/day; account quota
remains 20/day, 100/week, 300/month (production has no overriding quota/model variables).
The approved configuration, reset time, provider-credit distinction, conservative
accounting, exclusions, inspection and change/kill-switch procedures are in OPS §5.4.1.

Fresh backup: COMPLETED `2026-09-26T23:45:27.973Z`. Refreshed production dry-run listed
only `20260927083746_add_ai_spend_ledger.sql`; applied that sole reviewed migration.
Configured and read back enabled=true, 5,000,000 global micro-USD, 1,000,000 guest
micro-USD and five daily guest requests. No existing usage counters were reset.
Follow-up production dry-run is clean; all six production security checks pass.
All seven affected schema categories match the preserved hosted-candidate fingerprints
and counts. Advisor findings are the documented private-table INFO and pre-existing
search_catalog/leaked-password-protection warnings; no unexpected regression.
Hosted rehearsal and existing model evidence are unchanged and reused.

PR #170 merged as `c82a704cd2389e108a55e9eb8f554141b6863500` after every required PR
check passed. Approved amounts and this release record are a documentation-only
follow-up, avoiding a new full application test run just for Markdown.
At this checkpoint production still serves `99c32ac`; merge-triggered validation is
running. Database policy is configured, but application enforcement is not yet verified
live. Next: confirm the production deployment contains #170, run a bounded admission/
settlement smoke, and record the result. Do not toggle production limits for testing
or repeat the already-passed hosted denial and runtime suites.

Production closeout: #171 merged as `71c7c8b0550fdb6bd3dabdce41317c8f7b40c1e8`;
Vercel reports that exact commit READY on `www.netflux.blog`. Health returned 200.
One guest author-chat smoke against existing public content returned 200 and a complete
answer. The ledger recorded Anthropic Haiku, 2,526 input and 46 output tokens: 202,000
micro-USD reserved and 2,756 micro-USD settled ($0.002756). This confirms live dispatch
and settlement; no policy toggling or production test-suite replay was needed.
The smoke used no user account or private library data. Both implementation and policy
documentation are merged; root main was fast-forwarded. Temporary production environment
files were removed after verification. No temporary hosted project remains.

## Finding #23 mutation-boundary inventory — 27 September 2026

Owner: Netflux engineering/security (Codex implementation coordinator for this pass).
Inventory date/target: 27 September 2026. Baseline: `0e861306` on main.
Branch: `codex/mutation-boundary-inventory`, workspace `/Users/j/Desktop/Lifebook`.
This section records the original bounded inventory, before implementation. No production
mutation, migration or application edit occurred during that inventory pass. #22 is shipped;
STATUS and the register now reflect its production release rather than pending work.

Method: searched browser hooks/components, repository helpers, API mutation exports,
server actions and SQL migrations; compared with read-only production `pg_class`,
`pg_proc`, `pg_policies`, `pg_trigger`, `pg_constraint`, and table/column/function
privilege checks. Listed all 12 public functions executable by browser roles and cross-checked their code consumers;
`set_onboarding_state` is the exposed mutation helper, while the others are reads.
Grants alone are not evidence of writable rows: RLS and column grants are evaluated
separately. No real-user data or credentials were collected and no abusive writes
were attempted. This is structural evidence, not a runtime penetration test.

### Mutation families and authoritative controls

| Surface / code entry | Reachable boundary and existing protection | Remaining obligation |
| --- | --- | --- |
| Bookmarks/progress and guest import: `hooks/useReadingProgress.ts`, `/api/account-data/user_library/mutation` | Browser table mutation grants revoked; authenticated account-bound restricted worker, revision/reset checks, bounded streamed body, receipt capacity and idempotency. Legacy `/api/library/bookmarks` writes refuse stale clients. | Addressed by #174: account-keyed 120/minute admission before worker work, bounded Retry-After recovery and guest-import preservation. See release evidence below. |
| Account reset and snapshot/export creation: `/api/account-data/reset`, `/api/account-data/snapshots` | Strict account limits, restricted worker, locks, snapshot concurrency/size/time/expiry bounds and recovery. | Reuse #7/#10 runtime evidence; no new snapshot mechanism needed. |
| Highlights/notes: `/api/library/highlights` and `[id]` | Route validation/rate limits and ownership RLS. Direct authenticated table INSERT/UPDATE/DELETE remains allowed. Anchor-pair and overlap checks exist. | Addressed by #174: authoritative DB admission, text bounds and serialized 50-per-item cap apply to both route and direct writes; ownership/indexing semantics retained. |
| Reflections: `/api/library/reflections` and `[id]` | Ownership RLS and DB prompt/text length checks (500/1,000 chars). Direct authenticated writes remain allowed; route creation is limited. | Addressed by #174: authoritative account budget covers inserts, updates and deletes, preserving existing DB lengths and upsert semantics. |
| Feedback: `/api/feedback/content` | Route limit 20/minute; authenticated ownership RLS and per-item upsert. Direct authenticated writes remain allowed. | Addressed by #176: atomic DB admission covers route/direct feedback writes and removal, with bounded text; ownership retained. |
| Content requests/votes: `/api/content-requests`, `[id]/vote` | Request submission uses server RPC; browser has no applicable request-write policy. Vote route has 60/minute checks; direct vote INSERT/DELETE is permitted for owned/eligible votes and updates counts through triggers. | Addressed by #176: direct browser vote mutations revoked; existing server route admission, eligibility, uniqueness and count triggers retained and tested. Unused broad request grants are not an ordinary-user write bypass. |
| Notification preferences: `/api/notification-preferences` | Route limit 20/minute; one account row, ownership RLS; direct authenticated INSERT/UPDATE permitted. | Addressed by #176: atomic account DB budget and token bound cover reachable writes. |
| Profile onboarding and reader settings: `set_onboarding_state`, `useReaderSettings` | RLS restricts profile updates to owner; production grants UPDATE only on `onboarding_state`. RPC validates nonempty tour/version and supported status. | Addressed by #176: direct onboarding JSON gains shape/size/rate bounds; existing RPC key/version bounds retained. Reader settings persist through a controlled authenticated route without broader profile grants or role writes. |
| Reading activity/history: `/api/activity/log`, `/api/activity/history/content/[id]` | Authenticated/anonymous routes have validation and admission; aggregate content analytics RPCs are server-only. Direct own `reading_activity` INSERT/UPDATE policies remain. | Addressed by #176: browser mutations revoked; server logging/removal retained with verified-account admission and shared removal scope. |
| AI usage ledgers and three chat routes | #20–#22 enforce atomic quota/admission before dispatch. Browser own `ai_message_usage` INSERT remains permitted; trigger serializes account writes. Private monetary tables are server-only. | Addressed by #176: unnecessary browser mutations revoked; trusted AI admission and quota writers verified. Provider spending controls remain unchanged. |
| Email subscribe/unsubscribe | Server routes and server-only subscription RPC/table access; token/route controls. | Reuse existing controls; no direct browser-write path identified. |
| Admin content/sections/series, request actions, uploads | Admin authentication/server clients; narrow admin-only DB policies where present. Media/audio bucket size and MIME gates; processor queues/claims. | Retain existing admin/Storage security gates. Admin identity is a different trust tier, not evidence that every operation has a numeric quota. Background generation costs remain outside #22. |
| Scheduled narration, story image, notification and evidence workers | Admin/cron or private DB entry points, service/restricted roles, queue claims and bounded batches. | Keep privileged credentials server-only; reuse existing worker checks. Do not route these through end-user write admission. |
| Auth/OTP/admin login/logout and account deletion | Auth service/session/admin controls rather than ordinary table grants; account deletion has separate hosted/live evidence. | Preserve provider Auth limits and deletion semantics. No new Auth limits inferred from the table inventory. |
| CSP/image-fallback telemetry, anonymous activity session, chat export | Dedicated route validation/limits; telemetry/token or temporary-export side effects. | Keep explicit scope; these are not personal-library table writes. |
| Content batch/focus/recommendations/evidence resolver POSTs | POST transport for reads; evidence resolution rechecks access. | Do not add write quotas simply because HTTP method is POST. |

The original repository mutation helpers still exist but no production caller of
`upsertUserLibrary`, `updateUserLibrary`, or `deleteUserLibrary` was found. Do not
reintroduce them as a browser fallback. The existing security-new-object allowlist
accepts several historical grants; passing it does not close the gaps above.

### Bounded correction sequence and acceptance

1. **Library admission:** add an account-keyed, fail-closed server limit before worker
   work. Choose and document a budget using actual progress-save cadence and guest
   import/replay behavior; return Retry-After. Prove denied requests make zero worker
   calls, account isolation, limiter outage behavior, and queued 429 recovery without
   dropped changes. This can be a small application-only correction.
2. **Personal captures:** make highlight/reflection writes use a controlled server
   boundary with ownership derived from verified authentication; revoke direct browser
   DML in the same reviewed rollout (or enforce equivalent atomic DB admission if
   direct access is retained). Preserve RLS, field constraints, indexing invalidation,
   citation unavailability and exports. Prove direct Data API denial, other-account
   denial, exact size boundaries and concurrent admission with a disposable DB.
3. **Remaining direct paths:** cover feedback, votes, preferences, activity and legacy
   usage inserts; constrain onboarding JSON and repair reader-setting persistence.
   Reuse shared admission only where semantics match. Keep this separate from capture
   work so an unrelated preference fix cannot obscure retrieval evidence.

Use staged compatibility: validate existing consumers before revoking privileges;
never revoke a user-client write while leaving the deployed route dependent on it.
A route-only UI change cannot close a still-granted direct Data API path. Database
changes follow the existing disposable-hosted gate and reviewed production dry-run;
this inventory does not authorize skipping those gates or claim their completion.

Completion requires the inventory rows to point to either a tested authoritative
limit or an explicit scoped exception, including row growth, text size and repeated
indexing work. Do not add numeric quotas to every privileged/read operation by default.
Target dates for correction deliveries follow the first bounded design; no launch
promise is implied by today's inventory date.

Inventory handoff was documentation-only. Corrections 1–2 are implemented in #174;
see the release evidence below. The next bounded scope is correction 3. #24 and broader
deferred features remain outside this pass.

## Finding #23 library and capture admission — 27 September 2026

Branch `codex/library-write-admission`, workspace `/Users/j/Desktop/Lifebook`, based
on freshly fetched `ff46edab`. Implements the first two inventory corrections; remaining
mutation families stay open. No UI layout/design changes. One primary agent; no model
benchmark or paid AI calls. No production change or hosted project created yet.

Library admission uses verified account identity and existing fail-closed Redis
infrastructure: 120/minute accommodates ordinary saves and pauses larger guest imports.
The persisted request survives each wait unchanged; three automatic retries are bounded
and cancelled by existing session/reset/unmount aborts. A controlled hook fixture proves
queued guest data remains until acknowledgement, then the next item uses its predecessor's
exact revision. Existing journal replay and reset fixtures pass unchanged in behavior.

Capture design choice: enforce equivalent limits at the database boundary, retaining
ownership RLS and existing user-scoped clients. This avoids broadening routes to service
credentials or breaking deployed writes by revoking grants first. Private per-account
budgets serialize concurrent writes; AFTER row admission counts upserts once. DELETE
admission is per statement, preserving bulk removal. Reflection field constraints remain;
highlights gain authoritative text and 50-per-item bounds without deleting legacy data.
Operational details and exclusions are in OPS §5.4.2.

Reviewed candidate migration: `20260927105709_bound_personal_capture_writes.sql`.
Disposable local project `NetfluxCapture23`, isolated workdir `/private/tmp/netflux-capture-db`,
ports 583xx. First local attempt used the old default database and correctly failed on
missing reflections; its multi-statement migration rolled back. No local reset was run
there. A second project's initial port conflicted with an existing candidate, so the new
project was moved to unused ports; existing projects were not stopped or modified.
All current migrations replayed in the isolated project. Eight runtime cases pass,
including real Auth + direct Data API 429, concurrent last-unit admission, ownership,
private-counter denial, upsert counting, bulk rollback/delete, field bounds and index
invalidation/deletion. Required CI includes this suite. Full unit suite passed 1,535
with 268 declared skips before the added direct-API fixture; focused follow-ups cover
later test/error-copy changes. Lint and typecheck passed; no production credentials used.

Release evidence: [PR #174](https://github.com/Jseow008/ThePlayBook/pull/174),
verified head `27d1ebaf39aa0f1fb0be1c5d521137182249c1ba`, merged as `e8e93d70`.
Required validate, Security Validation, PR scope, Vercel preview and catalog evidence
passed. Security CI executed all eight capture-runtime cases; none were skipped.

The approved hosted candidate `mnctvrkwubwujtueayqp` completed 111-migration replay,
guarded reset and clean dry-run. Six security checks, eight capture runtime tests
(including actual Auth/Data API), seven browser checks and application save/receipt/
refusal proofs passed. Public types are unchanged. The candidate was deleted and its
absence confirmed; isolated server, private credentials/workdirs and build output were
removed. Unrelated local projects were untouched. Retained sanitized evidence:
`/private/tmp/netflux-pr174-evidence/` (`hosted-summary.json`, runtime/browser logs,
HTTP proof, schema fingerprints and production security results).

Production backup completed at `2026-09-26T23:45:27.973Z`. Applied only the reviewed
`20260927105709_bound_personal_capture_writes.sql`, SHA-256
`6a80f959419ffbc5900d52221ef7c4acbae5cb8b25562593c1d4f2debf8b048f`.
Follow-up dry-run is clean, all 14 schema fingerprint categories match the hosted
candidate, and all six production security checks report zero findings. Advisors show
expected private RLS-no-policy/unused-index INFO plus previously recorded public
search and leaked-password warnings; no unexplained regression. No environment change.

Harness lessons: compare receipt fields rather than serialized JSON key order. Run
linked CLI checks sequentially because concurrent temporary login-role initialization
can invalidate another command's password; the affected read-only dry-run succeeded
when repeated sequentially. No application or acceptance-test weakening was needed.

Production application `e8e93d70` is READY at `www.netflux.blog` after successful
post-merge validation and Security Validation. One ordinary synthetic account verified
library save 200, identical mutation receipt replay 200, highlight save 200, reflection
save 200 and health 200. The session was signed out, the account deleted, and zero
owned library/highlight/reflection rows confirmed. No production quota stress or
counter reset was performed. Smoke setup needed an authorized server credential lookup
and a password within Auth's 72-character bound; both were harness-only corrections.

Closeout branch: `codex/library-write-release-record`, based on merged `e8e93d70`.
The first two #23 corrections are released. The next bounded scope is the remaining
feedback/votes/preferences/profile/activity/legacy-usage inventory; #23 as a whole
remains open. Do not recreate the candidate or repeat unchanged database/model evidence.

## Finding #23 remaining write boundaries — 27 September 2026

Branch `codex/remaining-write-boundaries`, baseline `81d5cdba`. This delivery closes
unused browser mutation grants on votes, reading activity and AI usage, retaining their
existing bounded server writers and browser reads. Authenticated activity logs and
history removal now key their 30/20-per-minute limits by verified account, with a
shared removal route scope. Header changes cannot create another account allowance. Feedback and notification writes
retain ownership RLS and gain 20 committed writes/account/60 seconds in private DB
budgets. Upserts count once; deletes count per statement. Feedback reason/details are
bounded to 256/4,000 characters; notification tokens to 256 characters. Onboarding
updates share a 30/minute budget and validate at most 32 structured entries/32 KiB.
The RPC's existing tour/version bounds are retained; the historical replay's missing
single-column onboarding grant is explicitly restored without profile privilege expansion.

Reader settings use a new authenticated server route: 30/account/minute, a streamed
2 KiB body ceiling, strict enum/time validation and expected-account match before a
single-column server update. Browser reader/role/internal-flag grants stay denied.
Local settings and guest imports survive failures; per-account writes serialize and
queued writes/stale reads are rejected after account changes. No layout changes.

Evidence so far: 1,562 unit tests passed with 275 declared skips; lint/typecheck pass.
The new eight-case disposable runtime suite and existing 12 AI-quota cases pass,
including actual Auth/Data API refusal, concurrent admission, mixed update/upsert,
window renewal, field bounds, owner isolation, private helper denial, trusted vote
counts/activity/AI admission, and account deletion cleanup. Six local security gates
and the adapted RLS matrix pass. The legacy quota fixture now uses a trusted insertion;
a separate test proves browser insert/update/delete privileges remain denied.

One bounded agent implemented/tested reader persistence, then reviewed only the migration
and runtime fixture. Its two findings (token size and unnecessary BEFORE advisory lock)
were fixed and covered. Setup failures were harness-only: explicit local container/port
and disabled TLS for the local-only connection. No hosted/production TLS weakening.

### Release evidence and checkpoint

[PR #176](https://github.com/Jseow008/ThePlayBook/pull/176) merged as `a7cc3271`
from final head `457ebac6`. Exact-head validate, Security Validation, PR scope,
Catalog Search Evidence and Vercel preview passed. Security CI ran all eight new
runtime cases without skips, including real Auth/Data API coverage.

The user-authorized temporary hosted project completed a 112-migration replay,
guarded reset and clean dry-run. Eight new runtime plus twelve AI-quota cases,
six security checks, seven browser checks and ordinary-account HTTP proof passed.
The HTTP proof covers settings persistence/scope rejection, onboarding, feedback,
preferences, DB-driven Retry-After, vote counts/removal and activity logging/removal.
Public types match. Schema differences are the intended private budget/helpers/triggers
and browser ACL reductions. The candidate was deleted and absence confirmed; owned
local stack/server, private credentials/workdirs and candidate build output were removed.

Applied only `20260927114833_bound_remaining_account_writes.sql` to production,
SHA-256 `32a1dc2592b073687357c6784824f216b9d5bfeaa84cd658b3aca191f2fa8ad8`.
The completed backup was `2026-09-26T23:45:27.973Z`. Post-apply dry-run is clean,
all 14 schema fingerprints match the final candidate, and six security checks report
zero findings. Advisors retain reviewed search/password warnings and private-table INFO.
Safe evidence remains at `/private/tmp/netflux-remaining23-evidence`.

Review also caught mixed DELETE/upsert lock inversion; AFTER statement admission
fixes it while refused deletes roll back. Hosted files run sequentially to fit the
15-session pool, preserving concurrency inside tests. Browser harness corrections
concerned forwarded host/IP headers; production security and acceptance were not relaxed.

Production alias `www.netflux.blog` serves `a7cc3271` in READY state. Post-merge
validate and Security Validation passed. The authenticated production smoke verified
reader-settings persistence, account/field rejection, onboarding RPC, feedback save/remove,
notification preferences, activity log/removal, denied direct table mutations and health
200. The synthetic session was signed out, its account deleted, and zero owned
profile/feedback/preference/activity rows confirmed. No quota stress or counter reset.

#23 is complete for the recorded ordinary-account mutation inventory. Privileged
admin/worker/Auth and read surfaces retain their separately documented controls;
this does not close the wider audit. Next bounded work: #24 graceful failures.
Closeout branch: `codex/account-write-release-record`, based on `a7cc3271`.
No candidate recreation, migration reapplication or repeated benchmark is needed.

## Finding #24 graceful chat failures — 27 September 2026

Branch `codex/graceful-retrieval-failures`, baseline `9661e5fd`. Scope: the three
interactive chat paths, preserving models, ranking, evidence authorization, spending
admission and existing layout. No SQL or environment changes; no hosted project needed.

Inspection found unbounded library/source reads, platform-only generation deadlines,
and client handling that could retain/export unfinished answers as completed. The
correction applies a 50-second application deadline to preparation and streamed
response delivery, propagates cancellation, and emits an explicit safe error when
streaming cannot finish. Author Chat moves from plain text to the existing UI stream
protocol. Successful deterministic extracts/empty responses now carry explicit finish.
Clients exclude unfinished assistant turns from persistence/export/follow-up context,
retain the user question, and offer an explicit retry in the existing error card.
Retries remain subject to ordinary quota/spending admission; no automatic provider
retry, quota refund or fallback answer is added. Failed/pending evidence continues to
fail closed instead of returning a false empty result or partial evidence answer.

Acceptance: stalled auth/preparation returns 504 without provider dispatch; disconnect
and unmount cancel; stream interruption yields a safe error; only completed answers
persist/export; retry retains scope/question; late callbacks cannot replace new chat
state. Existing index/ownership/revocation tests remain required. One bounded client
agent handles recovery while the coordinator handles server deadlines and release.
Initial server/deadline suites: 103 tests pass; existing personal retrieval checks
also passed in the earlier overlapping run.
The initial full run passed 1,581 cases, with 277 declared skips and three client
fixture failures. Those failures were a missing test import and successful mock streams
without a finish marker; they are corrected. Final affected client suites pass 59 tests,
including actual SDK fast-EOF/error/abort/output-limit handling and scope replacement.
All route/deadline tests, typecheck and full lint pass. No acceptance threshold changed.
Already-open legacy Author clients get a refresh-required 409 before AI dispatch.
Author Chat's pre-existing optional-auth session behavior is not a new isolation
contract; this patch covers failure delivery and unmount cancellation, with existing
verified-session boundaries retained in library/Notes.
Implementation shipped in #178; the runtime correction and final release evidence are below.
Unchanged model/database evidence was reused; no temporary database was created.

### #178 production runtime correction

#178 merged as `64baf374` with required checks passing and reached production. A
27 September live probe then returned an empty 500 on `/api/chat/author`; Vercel
logs identified `Cannot read private member #state` while reconstructing Next.js's
proxied runtime request. Local ordinary-request fixtures missed that runtime shape.
At that point #24 remained open; the correction and verified release below supersede this hold.

Production was rolled back to verified `9661e5fd`, deployment
`dpl_7Hiv6hpDaLzVqyKnoBgkMjvfpz56`; the alias confirms READY and both library/Notes
unauthenticated probes return expected 401. No database change or rollback occurred.
Correction branch `codex/chat-request-runtime-fix` preserves the original request and
passes the deadline signal separately into all three handlers. The regression fixture
asserts a proxied request is retained; 105 affected API/deadline tests, typecheck, lint
and production build pass. Actual local HTTP returns library/Notes 401 and legacy
Author 409; new-protocol Author reaches its existing fail-closed limiter (503 because
the local limiter is unavailable), without a runtime exception or provider call. The corrected preview then passed actual HTTP checks: library/Notes 401, legacy Author
409 and new-protocol invalid Author payload 400.

### Verified #24 release

[#179](https://github.com/Jseow008/ThePlayBook/pull/179) merged as `ca30f92f` after all
required checks passed. Post-merge `validate` (`36326400372`) and Security Validation
(`36326400451`) passed before explicit promotion of production deployment
`dpl_uk3zLRauUek6uDtnmE4B1e3WSadx`. The alias `www.netflux.blog` confirms READY on
`ca30f92f`. No required deployment gate was bypassed.

Live verification on 27 September passed: library/Notes unauthenticated 401, legacy
Author refresh-required 409, invalid new-protocol payload 400, public health 200 and
one real public-source Author Chat response 200 with text and explicit `finishReason:
stop` in the UI protocol. It used ordinary spending admission; no quota was reset.
No account, personal record or database schema was created/changed for this smoke.
The deployment log scan showed the expected deliberately invalid 400 probe, with no
repeat of the request private-field runtime failure. Sanitized results are retained in
[the release artifact](evidence/graceful-chat-release-20260927.md); generated answer text is not retained.

#24 is complete within the recorded interactive chat failure scope: deterministic
fault/SDK tests establish timeout, cancellation, incomplete-answer exclusion and retry;
preview/live HTTP establishes the deployed request adapter and successful response path.
This does not substitute for #26's combined later-session journey or the remaining audit.
Closeout branch: `codex/graceful-chat-release-record`, based on `ca30f92f`.
Next workstream: #26 capture → later session → retrieval → evidence → export/reconcile,
reusing existing feature evidence and adding the missing combined ordinary-user proof.

### #26 combined journey — verified 27 September 2026

Owner: Codex (Engineering/QA), target/completed proof 27 September. Branch
`codex/complete-retrieval-journey`, application base `da8d62c2472ae8c3164498ccf56a22f76747db24`,
managed worktree `/Users/j/.codex/worktrees/retrieval-journey/Lifebook`.
The unchanged application passes the required ordinary-user production-build journey:
UI bookmark/reflection → sign out → fresh OTP login/session → real personal indexing
and Notes retrieval → validated exact-passage view → Settings export/reconcile.
The displayed quotation equals the original reflection. Both saved records occur
exactly once in the 11-collection export. Two distinct authenticated sessions are
proved, including removal of the first session before login. No skipped stages or
mocked retrieval; no new production account, migration, deployment or hosted project.

[Sanitized evidence](../tests/fixtures/retrieval/evidence/personal-journey-20260927.json)
records the build ID, durations and successful fixture/server cleanup. The final
journey took about 14 seconds after the production build. Dedicated local Supabase
`NetfluxJourney26` replayed all migrations. The launcher builds/owns the server,
validates local configuration/restricted connections, refuses dotenv leakage and
stale success, and binds only to loopback. Real provider calls use synthetic text;
ordinary quota/spending admission remains enabled with the approved $5/$1 local
policy, restored after the run. Unique synthetic limiter buckets expire normally.
Real OTP verification is exercised; external email delivery is outside this proof.
See the [repeatable runbook](evidence/personal-journey-runbook.md).

Five development stops exposed harness assumptions: initial welcome activation
(two stops, the second with diagnostic capture), canonical reader URLs, mismatched
forwarded origin during logout, and the migration's intentionally disabled initial
spending policy. Those were corrected in the harness; no product fix, prompt tuning,
threshold relaxation or provider-response selection occurred. A development journey
and two packaged verification runs subsequently passed. Final safety-only preflight
ordering was checked separately; application/provider inputs were unchanged.
Typecheck, focused lint and whitespace validation pass. One bounded agent mapped
controls and reviewed the harness; it caught missing displayed-text, server provenance,
cleanup and environment-isolation assertions. Codex token/billing attribution is
unavailable. No claim of general retrieval accuracy follows from this single query.

#26 acceptance is complete for the recorded fixture. [PR #181](https://github.com/Jseow008/ThePlayBook/pull/181) records the proof;
required GitHub checks and merge are the remaining repository closeout. Implementation
commit: `04aa547a` (subsequent edits only update this checkpoint). The dedicated local
Supabase stack was stopped without retaining a backup; private credentials and raw
logs were deleted after evidence retention. Other local stacks were untouched. Broader #27–#32
obligations remain separate; no extra benchmark or production replay is required
for these test/documentation changes.

### #27 screen-reader verification — 28 September 2026

#181 merged as `55bbcdb8` with required checks passing; root main was pulled.
Current work: `codex/screen-reader-verification` in managed worktree
`/Users/j/.codex/worktrees/screen-reader-verification/Lifebook`, based on that merge.
One implementing agent; no delegation, provider calls, production data or database
changes. Three localized corrections add reflection labeling, Notes request-state
announcements and export progress outside its disabled control. Layout/copy hierarchy
is preserved. Focused tests: 35 pass; typecheck, focused lint and production Webpack build pass.

The actual VoiceOver attempt is unresolved: settings showed On, but no running
screen-reader process, speech caption or navigation result was observable through
the desktop tool. Direct launch timed out; one settings restart did not resolve it.
VoiceOver is verified Off again, and the temporary Safari tab is closed. No success
is claimed for spoken output. The [evidence and executable human checklist](evidence/screen-reader-verification-20260928.md)
records the unverified spoken-output behavior. On 28 September, the owner explicitly
requested merging #182 and closing #27 despite this documented limitation. #27 is
therefore closed by owner acceptance, not by a passing VoiceOver run.

[PR #182](https://github.com/Jseow008/ThePlayBook/pull/182) merged as
`8c1ad354d45c364f205c9e5c86bae8e047ac9ddd`; required validation, Security Validation,
PR scope, catalog evidence and Vercel checks passed. Root main was pulled clean.
No production database change occurred, and post-merge deployment was not checked.
Closeout branch: `codex/close-accessibility-finding`, based on `8c1ad354`, in the same
managed worktree. This documentation-only closeout preserves the unexecuted checklist
and the reason for closure. Next workstream: #28 bounded capacity verification;
#29–#32 and other explicitly deferred findings remain separate.

### #28 capacity verification — preparation, 28 September 2026

#183 merged as `7ebab776`; root main was pulled clean. Worktree:
`/Users/j/.codex/worktrees/capacity-verification/Lifebook`, branch
`codex/capacity-verification`, based on that commit. One owner, no subagents.
The [bounded capacity runbook](evidence/capacity-verification-runbook.md) proposes
25 active users/50 burst, explicit outcome/latency/cost limits, and isolation rules.
No capacity test, provider call, production change or hosted project creation has
occurred. The scenario is not yet frozen in an executable runner.

Pending: optional owner workload selection and required fresh confirmation of the
temporary Supabase project's quoted $10/month cost. Do not interpret elapsed time
as cost approval. Production ref is excluded from candidate execution. Existing
per-network admission means one generator cannot prove independent-network user
capacity; keep admission and successful-work measurements distinct.

Two connected Vercel project-read attempts failed on contradictory argument schemas
(`projectId` versus `idOrName`); do not repeat that approach. Use authenticated CLI
or REST metadata access instead; the global CLI was not found on PATH. Next action:
resolve candidate cost approval, inspect hosted runtime/compute parity, implement
the bounded runner and run its small preflight before the frozen full scenario.
No results are claimed and #28 remains open.

#### #28 continuation — access/preflight

Owner approved proceeding with the quoted $10/month temporary Supabase project
and the 25-user/50-burst envelope. Cost confirmation was obtained; do not ask for
the same approval again. Creation is intentionally postponed until all hosted
dependencies are available. No paid candidate or production change exists.

Vercel CLI 54.17.2 refreshed its existing credential successfully. Direct REST
project inspection now works: production is Next.js, Node 24.x, Fluid enabled,
default function region `iad1`, basic build machine. The connector still has the
argument-schema failure; use the authenticated CLI/REST path, not repeated retries.

Upstash is signed out in the dedicated Opera tab at
`https://console.upstash.com/auth/sign-in`. An asynchronous user handoff requests
sign-in so an isolated rate-limit database can be provisioned. Do not use production
Redis buckets or disable the limiter to get the test running. No Upstash resource
was created. This is the immediate external blocker.

Added draft scenario JSON plus a pure evidence summarizer and six passing Node
regression tests (missing samples, quota restrictions, corruption, latency, dropped
load, aborts and per-operation failure rates). These are harness checks, not capacity
evidence. Workload execution, fixture seeding and hosted provisioning remain undone.
Current implementation branch is unchanged; initial plan commit `3aef0788`.
Next: after Upstash sign-in, create isolated dependencies, record compute/region
parity, finish the HTTP runner, freeze the scenario, then run the small preflight.

#### #28 hosted preparation — original account verified

Verified the current Upstash account owns `flux-prod-rate-limit`; its endpoint
matches the production Vercel Redis URL. No ownership transfer occurred. The account
allows one free database, so its existing production resource was left unchanged.
A separate free 72-hour Upstash scratch database was created (ID
`1b7751c8-752e-49ad-9731-b873cd815982`, expires 1 October); hosting parity is not
established. No paid Upstash plan or payment method was added.

Approved disposable Supabase: `rqtopztmopbxfmocpzzz`, same Mumbai region as production,
Micro compute, PostgreSQL `17.6.1.166` versus production `17.6.1.063`. Production
compute could not yet be conclusively established from selected-addons metadata.
All migrations replayed. Dedicated restricted-role credentials were provisioned.
Test-only certificate packaging supplies Supabase's published CA; direct setup and
application worker connections verify TLS. No production database changes occurred.

Dedicated Vercel project: `prj_SneBAuNkQ3xU3LmMOlPYOrpW0bb7`,
`netflux-capacity28-disposable`, Node 24.x / iad1. Current deployment:
`dpl_6WeDeibpHv8owoYpXPZHgM9dGJLg`. Clean baseline application source `7ebab776`
plus the test-only CA tracing inclusion. Scoped preview access remains protected.
Health, synthetic catalog match and canonical reader HTTP checks pass.

Private setup state lives under `/private/tmp/netflux-capacity28` (credentials must
never be committed or printed). This directory includes cleanup identities, replay
logs, private candidate configuration, corpus setup and fixture session setup. Both
hosted projects and the scratch Redis still require cleanup after verification.
Synthetic corpus: 10,000 items, 100,000 segments, 50 ordinary users, 100 library rows
per ordinary account and 1,201 for the oversized export account, 10 reflections each.
Session creation is paced after encountering Auth's existing request limit; this
is fixture setup, not load-test evidence. A wrong setup column name was corrected
against the migration (`current_revision`, `user_id`).

One fresh-context agent implemented the core runner and focused regression tests;
it also caught that upsert acknowledgements can advance by more than one revision,
and separated route timing from validation/read-back duration. 24 harness tests
pass. Coordinator adds real export/AI overlays. Full typecheck is running; real
personal indexing and paced session creation are in progress. No measured load
run has started, no performance pass is claimed, and no PR has been opened.

Exact next action: inspect `auth-setup.log`, `index-preflight.json`, and typecheck;
finish private runner config with authored pagination fixture; execute core and
overlay preflight once; only if they pass, freeze inputs and run full traffic.
Preserve all failures, then delete candidate services and private credentials.

#### #28 preflight stop — isolated Redis unavailable

The hosted core preflight stopped at its first library mutation: HTTP 503, shared
rate limiter timed out. Health, catalog match and canonical reader checks passed.
The temporary Upstash service's metrics reported zero commands and zero keys; a
direct authenticated PING also timed out at five seconds. A separate SDK probe
returned its timeout fallback, which is not service-success evidence. No admission
rule or deadline was relaxed. This is a candidate-dependency failure, not a
production capacity result. No full load test or export/AI overlay ran. Real personal
index setup completed 20/20 records; interactive generation was not called.

[Sanitized preflight evidence](evidence/capacity-preflight-20260928.json) preserves
the failed attempt. 24 harness checks, full typecheck and focused lint passed.
One agent implemented the core runner; coordinator prepared fixtures, hosting and
export/AI overlays. The overlay remains runtime-unverified. Fixture setup fixes
were local schema names and paced Auth admission; no product code changed.

Asked whether the owner approves a normal temporary Upstash pay-as-you-go database
with a $1 ceiling at the displayed $0.20/100,000 commands. Adding a payment method
is a user handoff. That answer is pending. Both the paid Supabase candidate and
dedicated Vercel project were deleted rather than left idle; scratch Redis is empty
and expires automatically on 1 October. Production resources are unchanged.

Next action: resolve the Redis option, prove its ordinary SDK rate-limit call works
before recreating hosted dependencies, then rebuild isolated fixtures and repeat
only the failed preflight/remaining stages. Preserve the failed evidence. Supabase
requires fresh cost confirmation for a newly created project. The previously
approved candidate is now deleted. #28 remains open; no PR or merge yet.

Fresh project listings confirmed both candidate deletions. Private credentials,
fixture sessions and temporary deployment files were removed after retaining the
sanitized evidence. Working branch: `codex/capacity-verification`; no published PR.

#### #28 authorized production preflight — stopped, cleaned up

The owner superseded the pending isolated-Redis decision by explicitly authorizing
controlled production testing. No billing upgrade, deployment or migration was made.
Pinned production remains `7ebab7769d59b3bef2e62fcc5121a3bc44ca6475`, deployment
`dpl_45LfcahgoMcf3cgvP1zkpAVUsg4S`. Worktree remains
`/Users/j/.codex/worktrees/capacity-verification/Lifebook`, branch
`codex/capacity-verification` (prior checkpoint commit `f572032e`).

One bounded fresh-context agent implemented the guarded production runner while the
coordinator prepared fixtures and monitoring. Harness checks, not hosted load, cover
the 2→5→10→25→50→5 sequence. Production development preflight stopped after one
save/read-back: save 4,715ms and read 2,255ms exceeded the frozen 2,000ms escalation
limit. All four measured HTTP responses were 200. An additional harness assertion
failed because PostgreSQL returned a bigint string and the acknowledgement used a
number. Corrected exact-integer comparison passes captured real read-back offline;
this was not evidence of lost or corrupt production data.

No full load stages, exports or AI overlay ran. No capacity pass is claimed and #28
remains open. [Sanitized evidence](evidence/capacity-production-preflight-20260928.json)
retains the failure, its classification and cleanup. Production detailed health
passed before/after; deployment was unchanged. All 15 created synthetic accounts,
library/reflection/index/boundary/receipt records checked were deleted, leaving the
original eight accounts and 496 published items. Private fixture credentials are
removed after retaining evidence. Existing quotas and configuration were unchanged.

Efficiency correction: account setup was started ahead of semantic preflight and
stopped at 15 accounts. The tracked runner now supports an explicit two-account-only
preflight; do not create the remaining 48 accounts before it passes. No new provider
experiment or test aimed at obtaining a favorable load result was performed.

Exact next action: diagnose save/read latency with a small two-account sample and
server-side phase evidence, separating cold starts/network/database execution.
Preserve this failed sample. Do not assume Upstash needs payment, weaken the latency
limit, or rerun full load until a credible explanation/correction is established.

Local verification for this checkpoint: 31 runner/report tests passed, TypeScript
and focused lint passed, and diff whitespace validation passed. The production
adapter and overlay are not claimed runtime-proven; only the retained small
production preflight ran. No additional agents were spawned for review.

#### #184 CI correction and read-only latency diagnosis

At head `2f59b6db`, `validate` failed because Vitest attempted to bundle `node:test`
from the two capacity harness suites. Security Validation, Catalog Search Evidence,
PR scope and Vercel passed. The correction excludes exactly those two files from
Vitest and executes both through Node in `npm test`; no tests or gates are removed.
The complete corrected command passes locally: 1,589 Vitest tests passed, 277
existing tests skipped, then all 31 capacity harness tests passed. Focused lint and
diff validation pass. This correction stays on PR #184 and requires fresh CI.

Read-only production metadata confirms functions in `iad1` (Virginia), database in
`ap-south-1` (Mumbai), and unchanged deployment. The ordinary idempotent save path
contains approximately 12 sequential SQL round trips, plus authentication,
admission and possible connection setup. Cumulative worker SQL statistics show
library-upsert mean 12.357ms / max 99.979ms and library-read mean 17.117ms / max
51.814ms. These are not per-request traces or cold-start measurements.
[Diagnostic evidence](evidence/capacity-latency-diagnosis-20260928.json) supports
investigating cross-region round trips before database scaling or an Upstash upgrade;
it does not prove an exact latency breakdown. No new accounts, provider calls,
production writes or capacity reruns occurred during this diagnosis.

Next: once the CI correction is clear, obtain route phase timings and compare a
small same-region candidate against the current route before changing production
placement or batching SQL. Preserve transaction/RLS/reset/idempotency guarantees.

#### #28 timing diagnostic completed on staged production build

#184 merged as `6cd056f8`; timing-only #185 merged as `b9fe7c10`, all required PR
checks green. Production build `dpl_MX3Tv9LobyGA74pWtEznoktLeAUM` was READY/staged,
with public aliases still awaiting post-merge deployment checks. OPS permits exact
build verification before promotion: the bounded sample used this protected
production-target build and existing verification access against production data,
without promoting it. Two ordinary synthetic accounts only; six successful writes
and six verified reads; all fixtures and sessions cleaned up afterward. Eight
original accounts and 496 published items remained, detailed health healthy.

Mean write client time 4,234ms: auth 544ms, admission 184ms, library operation 2,825ms.
Mean read client time 2,414ms: auth 642ms, library operation 1,397ms. No capacity pass
or p95 claim. Library operation includes network and connection overhead, so pure
network causality remains unproven. Regional placement is the next measured
candidate; Upstash upgrade is not supported by this evidence.

Evidence and exact next action: [timing checkpoint](evidence/library-latency-timing.md)
and [sanitized sample](evidence/library-latency-sample-20260928.json).
Current evidence branch `codex/library-latency-evidence` in
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`, based on freshly fetched
`b9fe7c10`. No production schema, SQL, quotas or region changes in this step.
Next: small same-region save/list comparison, preserving the baseline and all
correctness/admission guarantees, before any full capacity rerun. #28 remains open.

#### #28 regional correction — candidate evidence complete

PR #187 (`codex/library-mumbai-region`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`) changes only Vercel
placement for library save/list to `bom1`, using per-function configuration rather
than the deprecated Next.js region export. Base `fd3660a3`; tested application
commit `14ac1159`; subsequent changes are evidence/docs only.

A protected production-target candidate with aliasing disabled built successfully.
All 12 sample requests executed in Mumbai; a health-route control stayed in Virginia.
Mean write/read elapsed improved from 4,234/2,414ms to 945/313ms. Library phases fell
from 2,825/1,397ms to 40/14ms. Six writes and six exact read-backs passed, with two
synthetic accounts fully cleaned up and original 8 accounts/496 catalog items intact.
The first save was 2,471ms and is retained above target: no capacity pass or p95 claim.
See [timing checkpoint and limitations](evidence/library-latency-timing.md) and its
linked raw evidence. No SQL, schema, auth, quota, Upstash or global-region change.

Next: let #187's exact-head gates finish and merge through normal workflow, verify
public-route placement after normal deployment promotion, then resume bounded #28
preflight with unchanged thresholds. Preserve startup observations; do not rerun
until green. No new subagents or model experiments were needed.

### #28 public rollout and preflight — 28 September 2026

#187 merged as `bc33d7ab` and is publicly deployed; Mumbai library routing verified.
Branch `codex/capacity-public-preflight`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`, based on that main commit.
Two synthetic accounts; existing runner preflight passed all eight request/integrity
checks but stopped on first save 2.54s and reader 3.20s, above unchanged 2s/3s limits.
No load escalation. #28 remains open. See the updated
[library timing checkpoint](evidence/library-latency-timing.md) and linked evidence.

The temporary evidence wrapper failed after account deletion because its receipts
cleanup query named the wrong ownership column. Request timings were recovered from
stdout without rerunning traffic; phase headers and before-counts were lost and are
not claimed. Corrected read-only cleanup proof is retained in the evidence record.
Next: bounded phase tracing for save and reader before selecting another fix; persist
measurements before cleanup. No schema/config/application changes in this follow-up,
no new agents, no paid projects or Upstash upgrade.

#### Follow-up phase diagnosis

On the same `bc33d7ab` production build, six bounded diagnostic requests passed
semantic checks. Slow save 2,189ms = 537ms auth + 448ms admission + 92ms library,
with 1,110ms outside the measured handler. Reader remained in Virginia; approximately
0.94s elapsed after headers on both reads. No speculative optimization was applied.
Trace is in `docs/evidence/library-reader-phase-trace-20260928.json`.

Post-sample detailed health returned 503, preventing further traffic. Cleanup
completed and later health passed; all fixture accounts removed and original
8-account/603-total-catalog counts preserved (496 published). Failure bodies were
not retained, so its exact cause remains unknown. Next: diagnose health instability
and platform save overhead, then a reader-only regional candidate; no load escalation
or #28 closure. This evidence extends documentation-only PR #188 on the existing
branch/worktree; no new agent, production configuration, migration or paid project.

### #28 health diagnostics and reader placement experiment — 28 September 2026

Branch `codex/reader-region-health-diagnostics`, same library-latency-timing worktree,
based on freshly fetched `bc33d7ab`. No load escalation. Three detailed-health probes
11 seconds apart passed; the previous 503 cause cannot be recovered because its
response body was not retained and the server emitted no reason.

Implemented fixed-category database-probe failure logging with elapsed time, once per
actual probe (not cached response), without provider error text, URLs, credentials,
SQL or row values. Corrected a diagnostic race: an abort-resolved provider error must
be classified as timeout. Timeout, abort, caching, authorization and 503 remain intact.
Twelve health tests, typecheck and focused lint passed. No migration.

Staged production-target build `dpl_Aqp3rG63Lrv7FuoYGN75gusWSG2E` at `5b7f1b12`
confirmed a reader-only Mumbai override works. Two alternating anonymous reads each:
production 909/616ms; candidate 2,783/478ms. All content/title checks and detailed
health probes passed. No account writes, public alias change or paid project.
See `docs/evidence/reader-region-comparison-20260928.json`. An initial metadata check
stopped before traffic while the build was BUILDING; sampling began only once READY.

The region override was removed from the final diff: this small comparison does not
establish a first-load improvement. Only the health diagnostics correction is proposed
for release. Staged-build evidence covers that unchanged health code; reader timing
results describe the rejected configuration, not the final PR's performance.
Next: after diagnostic release, capture the reason for any recurrence; investigate
platform request startup/transport attribution for first saves and reader rendering
before another regional or caching change. Keep #28 open and load escalation paused.

#### #189 production verification — timeout recurrence captured

#189 merged as `18f2648af0e38a0b522e6ef3acad267c257dd062`; public deployment
`dpl_7vrXyfWwDDDQU97gYUYYN1H2Crv5` is READY and serves that commit. Library routes
remain Mumbai; the rejected reader override is absent. Required PR checks passed.

Three detailed-health probes 11 seconds apart returned 503/200/200. The first
response explicitly reported `Database connectivity check timed out.`; its matching
runtime warning recorded `health_database_probe_failed`, `reason: timeout`,
`duration_ms: 2505`, `timeout_ms: 2500`. Every configuration-readiness field was ready.
See `docs/evidence/health-postrelease-20260928.json`. The diagnostic release therefore
works and identifies the failing check, but it does not fix the underlying delay.

No load test, account creation, migration or further application change was performed.
#188 was rebased onto current main preserving both documents' histories and all
previous failed samples; its refreshed CI still gates merge. Next: distinguish the
probe's client initialization from request/transport/database latency. The existing
2.5s bound covers dynamic client import as well as query execution, so timeout alone
does not establish slow SQL or a database outage. #28 remains open.

### #28 bounded health phase investigation — 28 September 2026

Branch `codex/health-probe-phase-timing`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`, base `18f2648a`.
User authorized production testing and new Supabase projects if needed. No new
project, database mutation, user fixture, quota change, or public alias change was
needed. One coordinator; no subagents or model experiments.

Found a deadline-handling flaw: the health probe started its timeout before dynamic
client loading but attached the timeout race only after loading completed. The fix
races the entire operation and prevents a late initializer from starting a query.
The same 2,500ms deadline, abort behavior, 503 failure, auth and 10s cache remain.
Fixed numeric initialization/query/total timing is logged per actual probe; cached
responses do not create duplicate probe logs. No provider details or secrets logged.

Thirteen focused tests, typecheck and lint passed, including delayed initialization,
abort-resolved timeout, and cached-failure logging. Staged production-target build
`dpl_8sRC3MmXReujTEy29mN1L2XTSYrJ` at `59c801c1` passed the full production build.
It retained Virginia health placement, existing production dependencies and timeout.
Public production stayed at `dpl_7vrXyfWwDDDQU97gYUYYN1H2Crv5` (`18f2648a`).

Fixed read-only test: three alternating candidate/production probes with 11-second
pauses, then eight candidate probes with 30-second pauses. All 11 candidate and 3
production responses passed. Candidate runtime logs show initialization 0–26ms,
query 273–898ms. This rules out initialization as a dominant cost in these samples,
not in every historical failure. Request time includes transport and backend work;
it is not a measurement of SQL execution alone. No timeout recurred, so the previous
production 503s remain unresolved and are not erased by these passing observations.

Evidence: `docs/evidence/health-phase-comparison-20260928.json`,
`docs/evidence/health-phase-extended-20260928.json`, and
`docs/evidence/health-phase-runtime-20260928.md`. First observations are retained;
no rerun-until-green, forced failure, timeout increase, or capacity/load run.

Next: ship the deadline correction and diagnostics through required checks. Any
future health timeout now records which phase consumed the bound. Do not buy capacity
or change reader placement based on this small healthy sample. #28 remains open;
the first-save/reader latency failures and intermittent timeout need stronger
attribution before the original capacity workload can be declared passed.

### #191 live deployment verification — 28 September 2026

Confirmed #191 merged as `eabbfd90` and public deployment
`dpl_4LC9WxrT6gwx9frZi4LrMbvCp1aC` serves its phase diagnostics. Three spaced
production probes returned 200. Their initialization/request totals were
30/1487ms, 34/809ms, and 8/795ms; corresponding client totals were
4609.7ms, 1445.9ms, and 2041.1ms. First response therefore spent approximately
3.09s outside the measured probe, not in client module initialization.

Four additional curl connection diagnostics returned 200; DNS/TCP/TLS setup was
complete in 30–76ms, versus 0.36–1.27s total. These are cumulative curl connection
milestones, not additive times. Detailed probes may reuse the 10s cache. The result
narrows current investigation to hosted request processing/response delivery; it
neither isolates platform startup nor proves slow SQL or an upstream outage.

Evidence is in `docs/evidence/health-live-verification-20260928.json`. No accounts,
database writes, quota changes or load testing. #28 stays open. Next useful evidence
is platform request/startup tracing for an above-target request, not another batch
of general health probes or an unproven region/caching change.

Continuation: branch `codex/health-production-verification`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`, based on freshly fetched
`a87cff9f` main. This verification checkpoint is retained locally for the next
related change; no additional documentation-only release was opened for this smoke.
No local test or monitor remains running after this check.

### #28 matched platform timing checkpoint — 29 September 2026

Continuation on `codex/health-production-verification` in
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`; base `a87cff9f`.
The prior local checkpoint commit is `9f327467`. No application change, migration,
region change, quota change, or additional deployment was made in this investigation.

Production deployment `dpl_J4sfyQi2w24N1xcsKFU33mTdVHAe` serves `a87cff9f`.
The read-only platform request-log API supplies cold/hot start and function timing
metadata omitted by the normal CLI output. Older request logs returned
`ExceedsBillingLimitError`; no billing upgrade was made. Raw request metadata and
credentials are not retained in tracked evidence.

One fresh matched diagnostic used two synthetic accounts and six requests. First
save/read/reader client times were 3588/1633/3766ms; subsequent times were
816/223/1463ms. All six succeeded with integrity checks. Platform metadata confirms
the first save and read were cold invocations; the first reader had cold middleware
and page invocations. The subsequent requests were hot. Library operation times
were 8–115ms and reported function concurrency was one. This supports investigating
cold-path overhead; it does not demonstrate database saturation or establish capacity.
Function durations can overlap or exceed request duration, so they must not be added
or subtracted as exact critical-path accounting. Cold-start boot time alone also
does not explain all observed latency.

Evidence: `docs/evidence/capacity-platform-client-20260929.json` and
`docs/evidence/capacity-platform-runtime-20260929.json` (UTC collection date September
28, local Singapore date September 29). Both synthetic sessions were revoked and
accounts deleted. Fixture accounts/library/reflections/boundaries/receipts remaining:
zero. Existing account/catalog totals stayed 8/603. Final health was OK/reachable.
No test or monitor remains running.

The production sparse-sample stop is explicitly intentional in the runbook, not a
percentile calculation defect. It is stricter than the statistical acceptance rule
requiring at least 100 samples. No stop rule or acceptance threshold was changed.
Pending user decision: permit one fixed low-concurrency diagnostic with all cold
samples retained, without escalation to the 50-user ladder, or preserve the sparse
stop and investigate cold-path changes first. An async question was sent explaining
this safety-rule change. Until answered, do not run dependent production traffic.

Proposed diagnostic bounds: at most two disposable accounts, one in-flight request,
100 saves, 100 library reads, 100 reader requests; maximum 12 minutes and 300 measured
requests. No AI, export, or full capacity claim. Preserve auth, admission, integrity,
isolation, cleanup and health checks; stop on errors or failed integrity, health, or
resource bounds. Report every sample including cold starts, p95 and maximum per
route. Any later load escalation remains separately gated under the original plan.
Next action: resolve that decision, then implement and verify only the selected
bounded path; do not repeat the same sparse preflight until it happens to pass.

### #28 approved sequential diagnostic result — 29 September 2026

The user approved the bounded diagnostic exception after the checkpoint above.
One run completed on unchanged production `a87cff9f` / deployment
`dpl_J4sfyQi2w24N1xcsKFU33mTdVHAe`, using two ordinary synthetic accounts and
one HTTP request in flight. Measurement lasted 262 seconds; no discarded warm-up,
retry, provider call, migration, production configuration change, or new project.
The runbook records the one-run exception, preserving the original escalation gate.

| Route | Successful samples | p50 | p95 | Maximum | Above target |
| --- | ---: | ---: | ---: | ---: | ---: |
| Library mutation | 100 | 366ms | 649ms | 2291ms | 1 (>2s) |
| Library read | 100 | 196ms | 299ms | 516ms | 0 (>2s) |
| Reader HTML | 100 | 784ms | 1371ms | 3004ms | 1 (>3s) |

All 300 requests returned 200. Every save/progress/remove acknowledgement and library
read-back passed the existing semantic/revision checks. The first save and reader
were the above-target observations and remain included. Their cold/hot status was
not independently sampled in this run; the earlier matched platform evidence is
separate. Sequential p95 targets passed; this is not concurrent capacity proof.
At most one saved item per account and one reader title were exercised. No catalog
search, reflections, exports, AI overlays, or browser-rendering capacity was measured.

Evidence: `docs/evidence/capacity-low-concurrency-20260929.json`, including all
samples, route phase timings, health checks, bounds, harness hashes and limitations.
Summary percentiles and sample counts were independently recomputed from raw samples.
Both fixture sessions were revoked, both accounts deleted, and checked associated
records returned to zero. Existing totals remained 8 accounts and 603 catalog items;
final detailed health was OK/reachable. No test process remains running.

Decision: no infrastructure upgrade or speculative application fix is justified by
this run. #28 remains open for the concurrent mixed-workload envelope and missing
route/overlay coverage. The existing production escalation rule still blocks on sparse
latency exceedances; this one-run approval does not authorize replacing it globally.
Before the next load run, define a reviewed cumulative-sample escalation rule that
retains all slow samples, enforces error/integrity/health/resource stops, and evaluates
p95 only after sufficient samples. Avoid repeating the same first-request preflight.
Continuation: branch `codex/health-production-verification`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`. Prior evidence commits
`9f327467` and `7bd46686` are included in the same evidence-only PR. No subagents used.

### #28 two/five-user concurrent diagnostic — 29 September 2026

User authorized proceeding after the sequential result. One bounded run completed
on unchanged `a87cff9f` production, first at two simultaneous test users and then at
five. Each stage measured 100 successful requests per route. All 600 requests were
200 with passing save/progress/remove acknowledgements and read-back integrity.
Measurement including the stage transition took approximately 246 seconds; all first
requests remain included, with no warm-up exclusion or rerun.

| Concurrent users | Mutation p95 | Library read p95 | Reader HTML p95 |
| ---: | ---: | ---: | ---: |
| 2 | 1281ms | 279ms | 2598ms |
| 5 | 911ms | 291ms | 1379ms |

Both stages passed the original 2s API / 3s reader targets. At two users, three
mutations, one library read, and two reader requests exceeded their individual
targets (maximum reader 4861ms); all remain in evidence. At five users, none exceeded
the targets. Later-stage improvement does not demonstrate that more concurrency is
faster: warming and other shared-service state are uncontrolled factors.

The test was limited to five accounts, one saved item per account, one reader title,
and closed-loop batches. It did not exercise the original fixed-arrival mixed workload
or the remaining search/reflection/AI/export/browser coverage. #28 stays open. Next:
prepare the mixed-workload run with cumulative sample sufficiency and explicit
escalation stops, then execute its bounded stages rather than repeating these routes.
The default production ladder's sparse stop rule is still unchanged.

All five sessions were revoked, all five accounts deleted, and checked fixture
library/reflection/boundary/receipt records returned to zero. Existing totals stayed
8 accounts / 603 catalog items, and final health was OK/reachable. No migration,
configuration change, new project, application edit, or subagent was needed.

Evidence: `docs/evidence/capacity-concurrent-20260929.json`. Independently recomputed
all six 100-sample p95 values and verified outcomes/bounds/cleanup. Added to existing
PR #192 on `codex/health-production-verification`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`; no test process remains.

### #28 mixed-run stop and export harness correction — 29 September 2026

PR #192 merged as `4626ba95` after all required checks passed. During the mixed
run its merge had been held to preserve deployment identity. New independent branch:
`codex/capacity-export-adapter`, from freshly fetched main `4626ba95`; worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`.

Initial setup falsely treated Vercel's non-readable sensitive CRON_SECRET as absent.
Metadata and successful scheduled jobs proved it exists. No secret was changed;
the existing authenticated GitHub indexing workflow prepared fixtures in three
bounded batches. The first two temporary setup accounts were cleaned up. This was a
harness mistake, not a missing production setting.

The mixed run passed functional preflight and completed 2-, 5-, and 10-user stages.
It stopped early in the 25-user stage when both Node export checks failed, cancelling
outstanding core requests. 253 core requests were recorded; 50-user, recovery, and
AI retrieval did not run. Catalog search reached 136 successful samples with
cumulative p95 1675ms; other routes had insufficient samples for capacity conclusions.
The temporary diagnostic used cumulative sample-aware p95 gates plus a 10s absolute
core deadline and strict failure/integrity/restriction/scheduling stops. The checked-in
production runner's default sparse gate was not altered.

Root cause found in the overlay harness: the browser export client requires
window.location.origin and sends page reads as URL objects. The Node harness lacked
the origin and rejected URL inputs. Its reflection check also incorrectly required
user_id, which the real export deliberately omits. The correction supplies a scoped
origin/transport adapter, preserves preview bypass support and cancellation, checks
pinned origins before forwarding cookies, and matches exact fixture identities and
reflection fields. Failures retain durations and a fixed category; AI execution is
reported only after a request is actually attempted. No production application or
schema change is involved.

Nine focused tests passed, covering the actual export verifier through concurrent
account scopes, URL page requests, hash rejection, wrong-account fixtures, cross-origin
rejection, cancellation, request bounds and restored globals. Two real concurrent
exports then passed all 11 collections (two records each) in 42.93s and 41.93s with
24 HTTP requests. These are small smoke results, not the six-export load outcome.

All 56 mixed-run accounts, snapshots, operations and personal-index rows were removed;
the two later export-smoke accounts were also removed. Sessions were revoked before
deletion. Existing counts stayed 8 accounts/603 catalog items; final health was normal.
No AI retrieval requests ran (interactive ledger unchanged); real setup indexing did
run, within the reserved indexing allowance. No new project or quota/config change.
Evidence: capacity-mixed-setup-failure-20260929.json,
capacity-mixed-stopped-20260929.json, capacity-export-adapter-smoke-20260929.json
under docs/evidence. Preserve this failed run; do not count induced cancellations as
independent server faults or claim a passing capacity result.

Next: freeze the current live deployment, use the corrected adapter, and rerun the
bounded mixed workload once. #28 remains open. No production test process is running.


The first corrected repeat stopped during fixture indexing, before core load: workflow
36459122121 returned HTTP 503 after about 44 seconds and the worker set a 60-second
cooldown. Its old curl --fail discarded the safe response counters; deadline versus
provider failure is not established. All 56 accounts and checked derived rows were
cleaned up, with normal health and original counts. The next setup indexes only the
two AI fixtures before preparing the core pool. The workflow now retains the existing
safe JSON response with --fail-with-body, without changing its failure status,
endpoint, credential, timeout, or worker behavior. Do not label this a resolved
production indexing defect or discard the stopped setup evidence.

### #28 corrected mixed observation completed — 29 September 2026

Pinned live deployment `dpl_4RBos864PgtqKzKLsCfuLhWJMHsR`, SHA `4626ba95`.
Its diff from the prior application baseline is documentation/evidence only. The
corrected verification code is PR #193 commit `03cf4c69`; this closeout adds evidence
without another application change. Branch `codex/capacity-export-adapter`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`.

Reassessed setup after the indexing stop: index only the two AI fixtures first, then
create the core pool. One authenticated workflow run (36459824429) completed that
preflight. Existing 2/5/10-user core evidence was retained; this run repeated the
affected 25-user steady stage, 50-user burst and 5-user recovery. This is not one
continuous six-stage run. First requests were retained; no failed measurement was
replayed within the run, and prior failed attempts remain recorded.

All 780 scheduled core actions started, with zero scheduling drops, request failures,
restrictions, or integrity failures. There were 938 core HTTP requests plus 74 export/
AI HTTP requests. Core elapsed time: 348.58 seconds; maximum core HTTP concurrency:
9 (50 active users are paced, not 50 continuously outstanding requests).

| Route | Successful samples | Observed p95 | Interpretation |
| --- | ---: | ---: | --- |
| Catalog search | 473 | 1301ms | Meets 2s target and minimum sample count |
| Reader HTML | 155 | 1595ms | Meets 3s target and minimum sample count |
| Library mutation | 117 | 1139ms | Meets 2s target and minimum sample count |
| Library read | 117 | 260ms | Meets 2s target and minimum sample count |
| Reflection read | 58 | 1793ms | Insufficient: minimum 100 |
| Reflection write | 18 | 2004ms | Insufficient: minimum 30; do not claim a pass |

Six exports ran at concurrency two alongside the steady core workload. Every export
verified all 11 collections and exact fixture identities/fields; durations ranged
43.68–47.89 seconds, below the 60s bound. They contained two or three records each,
not the 1201-record fixture. Two real Notes retrieval requests returned the expected
indexed evidence in 13.28s and 11.85s, below the 30s bound. No AI percentile claim.

The interactive global ledger delta was 416616 microUSD reserved / 5610 microUSD
settled. These are global counters, not independently attributed per account or a
provider invoice. Setup indexing is outside that ledger and used the separate
250000-microUSD allowance; do not describe $0.00561 as the entire experiment's bill.

All 56 sessions were revoked and accounts removed. Checked library/reflection/state/
receipt/index/snapshot/operation rows returned to zero. Existing totals remained
8 accounts and 603 catalog items, and final health was OK/reachable. No test process
or temporary hosted project remains. No production setting, quota, or migration changed.

Evidence: `docs/evidence/capacity-mixed-completed-20260929.json`, independently checked
for counts, outcomes, bounds, percentiles, and cleanup. #28 remains open for sufficient
reflection samples, large-corpus/large-export coverage, and the originally specified
longer envelope. The earlier 56-record indexing 503 is not explained or erased by a
successful two-record preflight. Next: resolve these explicit coverage gaps; do not
repeat the already-passing core/export/AI checks without changed inputs or a new concern.

### #28 reflection observation and region correction — 29 September 2026

PR #193 merged as `f33f9858` with all required checks passing. Continuation branch:
`codex/reflection-health-regions`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`, based on that fresh main.
The tested live deployment remains `dpl_4RBos864PgtqKzKLsCfuLhWJMHsR` / `4626ba95`.

One separate reflection-only sample was planned: 100 GETs, 30 POSTs, two synthetic
accounts, one request in flight, minimum 6.5-second write-cycle spacing, 10-second
request bound and six-minute measurement bound. It does not pool the previous mixed
sample or claim the original mixed-load envelope.

The first preflight returned health 503 before accounts/load. Matched runtime logs
show initialization 8ms, query 2498ms, total 2505ms against the unchanged 2500ms
health deadline. Platform logs show a cold iad1 function, concurrency one. Three
fixed recovery probes subsequently passed (query 1123/877/814ms). This locates the
timeout in the database request but does not prove database saturation or its cause.
The initial failure is retained in `capacity-reflection-health-stop-20260929.json`.

After recovery, the single measured attempt stopped on a 10009.54ms GET timeout:
60 successful reads out of 61 attempts and 17 successful writes. Maximum successful
read/write times were 8289.10/7784.07ms. Neither minimum sample count was reached;
no p95 pass is claimed. A partial platform-log window confirms multi-second delays
inside warm iad1 functions at concurrency one (including 7516ms); the delay is not
solely client-side. No retries were made within the measurement. All two accounts,
sessions and checked derived rows were cleaned; original counts remained 8 accounts
and 603 catalog items, with final detailed health OK/reachable. Evidence:
`capacity-reflections-stopped-20260929.json`.

Bounded correction: place only reflection and health functions in `bom1`, beside the
existing Mumbai database and library functions. This follows the same per-function
configuration already deployed for library access and Vercel's data-locality guidance
(https://vercel.com/docs/functions/configuring-functions/region). It removes a known
cross-region dependency; it is not proof that geography explains every slow request.
No timeout, admission rule, route logic, database schema, provider model or paid tier
changes. Verify the built function placement and rerun only affected health/reflection
evidence after deployment. Keep #28 open until that measurement is complete.

The earlier bulk-indexing 503 remains unexplained: code inspection confirms any
nonterminal indexing failure can set cooldown, so cooldown alone does not establish
provider rate limiting. #193 now retains the safe response counters for the next
occurrence. Do not recreate the 56-record indexing burst just to seek a passing run.

The original large-corpus/large-export and longer mixed envelope remain untested.
A scope question is pending: complete the original isolated benchmark, or explicitly
approve a current-catalog launch scope and defer the larger envelope. No reduced
acceptance scope has been assumed and no new hosted project has been created.

### #28 Mumbai reflection verification passed — 29 September 2026

PR #194 merged at `d5d825cb`; all required PR checks passed. Production alias serves
that SHA in deployment `dpl_GhcBVRTQ8AG56jFvU3ogGnNvoxHL`. Deployment metadata verifies
reflection, health and existing library functions in `bom1`; a partial runtime-log
window independently shows 36 reflection invocations using `bom1`.

One bounded repeat of the affected reflection observation completed: 100 reads and
30 writes, two accounts, one HTTP request in flight, first requests retained, no
retries, 190.33 seconds. Read p50/p95/max: 261.46/816.28/2734.81ms. Write p50/p95/max:
671.47/783.21/798.78ms. All 130 requests and data checks succeeded. Both p95 targets
and sample minimums pass; one read exceeded 2 seconds, so this is not a maximum-
latency guarantee. Do not pool these samples with the earlier mixed workload.

All eight detailed health probes passed. Initial runtime probe events recorded
25ms initialization with 887ms and 691ms database requests. This run does not prove
intermittent timeouts can never recur or isolate geography as the sole cause of the
previous failure; before/after observations occurred at different times.

Both sessions were revoked and run-owned accounts/data removed. Checked library,
reflection, boundary, receipt, personal-index, snapshot and operation rows are zero.
Original totals remain 8 accounts and 603 catalog items; final health OK/reachable.
No migration, paid tier, timeout, quota or production setting changed in this repeat.
No verification process or hosted candidate remains. Evidence:
`docs/evidence/capacity-reflections-mumbai-20260929.json`, independently recomputed
for sample counts, nearest-rank percentiles, cleanup and platform region.

Branch `codex/capacity-reflection-results`, based on `d5d825cb`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`. This continuation changes
only evidence/documentation. Original failures remain retained. #28 stays open for
the large-corpus/large-export and longer mixed envelope, including reflection
coverage under that mixed load. The initial indexing 503 remains unexplained; the
read-only preflight found no current non-ready indexing backlog. Do not rerun the
passing low-concurrency sample without changed inputs or a new concern.

Next: resolve the isolated-environment versus explicit current-catalog scope choice
before the larger benchmark. Prior authorization for production observation did not
authorize publishing thousands of synthetic catalog items. A new hosted project
requires the provider's fresh cost confirmation and a working isolated rate backend;
no reduced acceptance scope has been assumed.

Isolated-environment prerequisite checked through the existing Opera Upstash session:
only production `flux-prod-rate-limit` is listed. The Create Database control reports
one free database allowed and requires a payment method for another database. No
resource, plan or billing change was made. Supabase's current get_cost quote for the
existing Netflux organization is $10/month for a new project; its tool requires fresh
cost confirmation before creation. Do not create a paid database while the isolated
rate backend is still unavailable. Human next action for the original benchmark:
add the Upstash payment method and confirm the temporary Supabase quote. Alternatively,
a narrower current-catalog acceptance scope must be explicitly approved, not inferred.
Results/evidence PR: #195, initial evidence commit `72aad03a`; this note records the
concrete blocker found afterward. No test process or temporary project is running.

Continuation checkpoint: the owner's subsequent “Proceed” is accepted as approval
of the quoted $10/month temporary Supabase project. Do not ask for that same approval
again unless the quoted cost or scope changes. Creation remains deferred until Redis
is ready. Fresh Opera inspection still shows “No credit card added yet” in Upstash;
the billing page is open at https://console.upstash.com/account/billing for the owner
to complete Add new card. No card, project or database was created. #195 at `6fe6c804`
remains open with auto-merge enabled; required CI is still running. This continuation
note is intentionally local pending the next substantive evidence update, avoiding
another documentation-only CI restart while blocked on billing.

### #28 production-only instruction and large-export finding — 29 September 2026

The owner explicitly rejected additional test databases and authorized direct
production testing. This supersedes all preceding billing/isolated-environment
prerequisites. Do not ask for a card, create paid projects, or silently reinstate that
requirement. Retain any coverage limitation that cannot be tested with hidden fixtures.

A fixed two-account export preflight used 1201 uniquely tagged, unpublished draft
catalog records and 1201 private library rows for one account; the other had no library
rows. Actual anonymous and ordinary authenticated queries could not read the first
draft before fixture expansion. Live RLS restricts both roles to verified content.
Snapshot export reads the owned library directly, so these draft references exercise
full library pagination without putting synthetic publications in public browsing.

On production `d5d825cb` / `dpl_GhcBVRTQ8AG56jFvU3ogGnNvoxHL`, the large export hit
the unchanged 60s deadline (60009ms); the simultaneous two-record export completed
in 48694ms. Both snapshots were created. Platform observations: creation
17463/17710ms, page-request median 2741.5ms (26 observed), all snapshot handlers in
iad1. Larger load has not started. These results support co-locating the snapshot
routes with the Mumbai database; they do not separately measure SQL execution time.

All 1201 draft entries, both accounts/sessions and checked library, reflection,
boundary, receipt, personal-index, snapshot and operation rows were removed. Original
8-account/603-item counts and healthy detailed status were restored. Evidence:
`docs/evidence/capacity-large-export-stopped-20260929.json`. Original failure retained.

PR #195 auto-merge was temporarily disabled to keep the test deployment stable. It
now includes the bounded per-function region correction for snapshot creation,
resume and collection reads, using the same established bom1 configuration. No
migration, timeout, quota, authorization or payload behavior changes. Branch/worktree
remain `codex/capacity-reflection-results` /
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`. Next: validate and deploy
this candidate, repeat the 1201-record export, then execute the longer production
workload if the export meets its unchanged bound. No test process remains.

Prepared longer workload (not yet executed): warmup 5 users/120s, steady 25/600s,
burst 50/120s, recovery 5/120s; 10-second per-user pacing, 20-minute hard bound,
3500 core HTTP request cap, original latency/integrity thresholds, all raw samples
retained. Deterministic schedule has 2220 actions, 52 reflection writes and at most
8 reflection writes in any 60-second window, below the existing 12/network/min limit.
Temporary driver: `/private/tmp/netflux188-preflight/long-runner.mjs`. The original
10k published catalog/100k segments remains untested; draft records cannot prove that
search-index workload. Do not publish fake catalog content to fill the evidence gap.


### Production capacity completion — 29 September 2026

PR #195 merged as `c57dd537234677cbac67e6ad0f6da3e3019c78a9`; both required
merge-commit checks passed. The public alias now serves READY deployment
`dpl_DRvwp6wrBvFyscMSZwFPbvK3sa8S`. Public health returns 200 and unauthenticated
snapshot resume returns 401. Snapshot routes run in bom1. No migration or quota
change was required.

The corrected 1201-library-record export completed in 5594ms (previously exceeded
60000ms), with all 11 collections verified. See
[large export evidence](evidence/capacity-large-export-mumbai-20260929.json).
The failed US-region result remains recorded; this is not a discarded retry.

A subsequent fixed production workload completed: 5 users/120s warmup, 25 users/600s,
50 users/120s burst, and 5 users/120s recovery, paced at one action per user per 10s.
All 2220 scheduled workload actions plus five preflight actions started, without
drops. All 2664 core HTTP requests succeeded; maximum simultaneous core HTTP
requests was 9. All six concurrent export overlays succeeded, including 1201 library
records plus ten reflections in 6879ms. Each core account began with 100 saved
items and ten reflections. No application admission limits were changed.

Cumulative p95, including first requests, preflight and warmup: search 1769.54ms,
reader 1638.06ms, library mutation 973.30ms, library read 291.91ms, reflection read
633.86ms, reflection write 737.70ms. All cumulative minimum-sample gates passed.
The 25-user stage also independently has sufficient samples and meets all six
route targets. Sparse burst/recovery samples are not independent route-capacity
proof. Slow tails remain: maximum search 6186.61ms, reader 5814.43ms, save 3703.42ms.
Warmup search p95 was 2174.54ms with only 36 samples; no samples were discarded.

Evidence: [full workload](evidence/capacity-long-production-20260929.json), including
raw requests, per-stage summaries, timing, driver hashes, cleanup, and limitations.
The immutable production-configured build was tested before public promotion using
existing platform protection access, ordinary account authentication, and shared
production services. Promotion happened normally after its required checks.

Cleanup verified zero owned accounts, library/reflections, boundaries, receipts,
personal index, snapshots, operations, and draft catalog records. Original counts
(8 accounts/603 catalog items) were restored; final detailed health was ok. All
56 accounts and 1201 draft entries were run-owned. Drafts were verified inaccessible
to anonymous and ordinary authenticated reads; none were published.

#28 remains open only for evidence beyond this bounded observation: the original
10k published items/100k segments and diverse-query workload were not reproduced;
this run used the current catalog and one search/reader item. AI retrieval was not
run concurrently; prior AI evidence is separate. Browser rendering/file-creation
latency is outside this HTTP/export-client measurement. Do not claim full original
capacity-contract closure or infer a need for an Upstash upgrade from these results.

Current branch: `codex/capacity-production-results`, based on `c57dd537`; worktree:
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`. No test process or
synthetic fixture remains. Next: publish this evidence-only PR. Then explicitly
resolve the remaining capacity scope before a larger launch; no automatic rerun,
new paid project, fake published catalog, or infrastructure upgrade is planned.


### AI alongside normal traffic — 30 September 2026

User authorized one bounded production AI mixed test and explicitly requested that
#28 remain open for questions. PR #196 is merged (`9e8d31bc`); public production
was pinned to READY deployment `dpl_CFKwiceTRdYoqg9vNck6azAA5cTV`.

First setup: real indexed AI preflight passed, then the browser-style global fetch
wrapper intercepted administrative account creation. No mixed traffic began.
Both accounts were cleaned. This harness failure is retained in
[evidence](evidence/capacity-ai-setup-failed-20260930.json). The corrected driver used
ordinary authenticated HTTP directly for AI and reused the successful preflight.

Mixed run: five core users, 90 scheduled actions at 10-second pacing, six AI
requests in three pairs, 30-second AI deadline, unchanged production quotas. All
90 actions started with zero drops; all 123 core HTTP requests succeeded. All six
AI responses contained the expected reflection evidence, taking 8463–15640ms.
However, the final harness verdict was unsuccessful: a redundant post-action
assertion inspected `transport.requests.at(-1)` while another concurrent request
could still be pending. It produced 35 action-failure markers. A local two-request
reproduction confirmed this race. The original markers and unsuccessful verdict
are retained; this is not declared a clean acceptance pass. The erroneous assertion
was removed from the temporary driver, but no additional production run was started.

Global ledger settled-cost delta was 16929 microUSD ($0.016929); exposure delta,
including outstanding reservations, was 18777 microUSD. These are global deltas,
not account-attributed provider billing. Initial preflight cost is separate.
All seven accounts/sessions and checked library, reflection, boundary, receipt,
personal-index, snapshot and operation rows were removed. Original 8 accounts and
603 catalog items were preserved; final detailed health was ok.

[Raw mixed evidence and assessment](evidence/capacity-ai-mixed-20260930.json).
Six AI samples are only a bounded coexistence observation, not an AI percentile or
maximum-capacity proof. #28 remains open; larger corpus/query diversity is untested.
No application changes, migration, infrastructure upgrade, or new paid project.
Branch `codex/capacity-ai-mixed`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`, base `9e8d31bc`.
Next: publish this evidence-only update, then answer the user's questions before
any further capacity testing or closure. No production test remains running.



### Authorized AI confirmation — 30 September 2026

After the user explicitly authorized the correction/repeat and highlighted API
cost, 28 local harness tests passed, including both concurrent completion orders,
a real HTTP-failure stop, and unchanged global fetch for administrative setup.
No paid calls were used for local validation. The erroneous shared-tail assertion
was absent; each action used the existing request/semantic verifier and failures
aborted the mixed run. No browser-style global fetch wrapper was installed.

One repeat ran on public production `6f5e35ae` /
`dpl_8NeoLHqwf8CwZX2SfxtVHdh9NZdx`: five core users, 90 actions at 10-second pacing,
and exactly six AI requests in three pairs. No extra AI preflight or automatic
retry. All 90 actions started, no drops/failures, all 123 core HTTP requests passed,
and all six AI responses contained the expected evidence. AI duration 7783–12273ms,
within the unchanged 30-second deadline. This is a clean bounded coexistence pass,
not an AI percentile, throughput, or diverse-query quality claim.

Global settled-cost delta was 16964 microUSD ($0.016964); exposure delta including
unsettled reservations was 18812 microUSD ($0.018812). These are recorded global
ledger changes, not exact account-attributed billing. Existing $5/day global and
$1/day guest limits remained enabled. The driver checked exposure before AI calls;
no spending policy or model setting changed. Indexing used the existing worker.

All seven synthetic accounts/sessions and checked library, reflections, boundaries,
receipts, index, snapshot, and operation rows were removed. Original counts
(8 accounts/603 catalog items) were restored and detailed health returned ok.
[Full evidence](evidence/capacity-ai-confirmation-20260930.json). Previous failed
setup and inconclusive mixed evidence remain intact.

#28 remains open at the user's request. Larger-catalog/query-diversity evidence
is still deferred; no further production load or paid AI test is running/planned.
Current branch `codex/capacity-ai-confirmation`, base `6f5e35ae`, worktree
`/Users/j/.codex/worktrees/library-latency-timing/Lifebook`. Next: publish tests and
evidence, then answer the user's questions before any further capacity work.

### PR #198 merge blocker — 30 September 2026

PR #198 remains open: validate, scope, catalog evidence, and Vercel passed, but
Security Validation failed the production dependency audit. The existing
brace-expansion 5.0.9 override is covered by high-severity denial-of-service
advisories; its Sentry/minimatch dependency chain was flagged. This is unrelated
to the capacity tests and requires no paid AI or production benchmark repeat.

A separate repair on `codex/brace-security`, based on `6f5e35ae`, updates only the
existing 5.x override and its two lockfile entries to 5.0.12, plus this checkpoint.
Worktree: `/private/tmp/netflux-brace-security`. Clean locked installation and
production dependency audit pass (zero production vulnerabilities); brace matching
through both affected dependency chains passes. Required CI will gate the repair.
Next: merge the repair after checks, update #198 from patched main, and confirm its
required checks and merge. #28 remains open. No application or database changes,
production testing, model calls, or spending-policy changes are needed.

PR #199 subsequently passed all required checks and merged as `84de46cc`.
PR #198 is now rebased onto that patched main, preserving the confirmation evidence
and regression tests. The conflict was confined to appended checkpoint sections;
both histories were retained. Next: required checks and squash auto-merge of #198.
No paid AI calls or production capacity reruns were performed for this update.

### First-load resource correction — 30 September 2026

User scoped this change to first-page loading; AI routing/timings and #28 closure
remain out of scope. Branch `codex/first-load-resources`, worktree
`/private/tmp/netflux-first-load`, based on main `aeb24f9a`. Preserve layout, copy,
font families, image quality and navigation semantics.

The small candidate disables global Outfit font preloading (font still loads where
used), gives fixed-width shelf cards their actual 176px/240px image sizes, and
prefetches card links on hover/focus instead of automatically for every card.
Other card layouts retain their existing image sizing; hero priority is unchanged.
Local typecheck and focused card/lane tests pass. Next: compare production and the
built preview on desktop/mobile, including keyboard/hover navigation, font use,
image resolution, request counts and constrained-network rendering. Do not claim
latency improvement solely from reduced resources or a single timing sample.
Baseline diagnostic artifacts remain `/private/tmp/netflux-ux-diagnostic/`.
No paid AI calls, database changes, analytics removal, or typography redesign.

PR #200 application commit `dfb7cd0a` completed the bounded browser comparison:
12 cold-cache navigations across Home, Browse and one reader, production versus
the built preview, desktop and constrained mobile (1.6 Mbps, 150ms, 4x CPU).
The welcome tour was dismissed in both contexts. These are returning-visitor
page measurements, not first-ever-visitor or real-user averages. The initial
fixture stopped when the existing tour intercepted navigation; that setup failure
is preserved separately in `comparison-initial.json` in the artifact directory.

- Font preloads: three to two everywhere. Home/reader font transfer: 120,020 to
  87,492 bytes; Browse still uses Outfit and downloads it on demand.
- Browse initial RSC requests: desktop 30 to 20; mobile 24 to 21. Hover/focus
  followed by card navigation passed for both targets and device configurations.
- All pages had no horizontal overflow; screenshot review found the same layout
  and typography. Browse's rotating hero prevents pixel-identical screenshots.
- Shelf image sizing is correct, but this sample did not establish image-byte
  savings. Production/preview analytics differ, so total JavaScript differences
  are not attributable to this patch.
- Constrained-mobile LCP, baseline to preview: Home 2812 to 2976ms, Browse 3356
  to 3260ms, reader 3912 to 3792ms. Desktop results were also mixed. One sample
  per case and different deployment/cache conditions do not prove a speedup.

Local typecheck, focused lint and 33 card/lane/standards tests passed. Browser raw
evidence: `comparison-pages.json` and paired screenshots in the artifact directory.
No additional load or paid AI testing occurred. This reduces speculative work;
the larger first-load JavaScript/CSS bottleneck is not declared solved. Next:
required PR checks and squash auto-merge of #200; #28 remains open. This final
checkpoint is documentation-only and retains the measured application tree.

### Critical first-paint follow-up — 30 September 2026

#200 merged as `73b8ad81`. Current branch `codex/critical-first-paint`, worktree
`/private/tmp/netflux-critical-paint`, based on that merge. User authorized follow-up
implementation and deployment verification; no AI calls or capacity test needed.

Same-production constrained-browser diagnosis found CSS completion immediately
before paint. Normal versus diagnostic script blocking: Home FCP 2800/1300ms,
Browse 3120/1468ms, reader 3836/1552ms. Script blocking is an attribution experiment,
not a deployable fix. Raw evidence: `/private/tmp/netflux-critical-evidence/diagnostic.json`.

Candidate uses Next's experimental inlineCss to deliver CSS with HTML. This keeps
styles, scripts, analytics and error monitoring intact, but increases HTML and
sacrifices independent CSS caching on hard visits. Local Next documentation flags
RSC duplication and experimental status. Do not merge on the diagnosis alone.

Next: built-preview comparison against immutable #200 preview with the same env,
three cold and warm samples per Home/Browse/reader, alternating order. Require
meaningful cold-paint improvement and examine warm navigation/HTML costs before
accepting the tradeoff. Keep every sample, including slow ones; do not rerun until
favorable. A reusable browser check also asserts inline styles and no stylesheet
dependency on hard loads. #28 remains open. AI wait time is a separate workstream.

First candidate `887e315f` completed all 36 fixed cold/warm navigations. Median cold
FCP: Home 2336→712ms, Browse 2912→756ms, reader 3564→1536ms. Warm FCP changes were
+148/+96/+68ms. However Browse LCP regressed 3252→3892ms: its first hero image now
competes with shelf images that begin loading as soon as the earlier layout paints.
This candidate is not accepted as-is. One targeted refinement gives the initial
hero image explicit high fetch priority; all images/quality/layout remain unchanged.
Next: verify the actual hero request priority and repeat the affected Browse
comparison only; reuse unchanged Home/reader evidence. Build-time output guard
checks rendered production HTML rather than merely checking the configuration flag.
The initial guard test loader failed to resolve a data-URL module; replacing it
with a normal module import fixed the fixture (three tests pass).

Refinement `c41f96aa`: actual browser requests confirm High priority for the initial
hero. Across three more cold/warm Browse pairs, median cold FCP 2920→768ms; warm
368→512ms. Cold LCP 3264→3384ms, warm 740→780ms. The first candidate LCP was 5096ms
versus baseline 3588ms; retain this slow result. Navigation smoke overlapped part
of that comparison, so main-thread timings may include local contention. This is
strong evidence for removing the blank-screen CSS dependency, not a proven hero
image speedup or a guarantee about every user's total loading time.

Desktop/mobile Home→Browse→Preview navigation and final heading typography/geometry
passed. An initial smoke assertion checked before route content arrived; waiting
for the visible heading corrected that fixture. One early screenshot missed the
animated heading; a constrained follow-up observed its opacity reach 1 at 1.63s
(candidate) versus 3.40s (baseline), with no later opacity reset. Final screenshots
match the existing design. Existing analytics, scripts and error monitoring remain.

Evidence retained in `docs/evidence/first-paint-20260930.json`; raw screenshots and
heading samples remain `/private/tmp/netflux-critical-evidence/`. The application
change is accepted for the large first-paint improvement, with the explicit larger
HTML, experimental-framework and slower warm-reload tradeoffs. No global JavaScript
performance or tail-latency closure is claimed. A build-output guard prevents the
CSS waterfall from silently returning and caps critical CSS at 320 KiB (currently
about 256 KiB uncompressed). Repeat the browser script for relevant framework or
critical-style changes, not every unrelated edit. The source-scan narrowing probe
saved only 161 compressed bytes and was discarded.

Next: final required CI and squash merge of #201, then verify the production build
identity, inline CSS, hero priority and navigation. Production follow-up is explicitly
requested; do not stop at merge. No further capacity run or paid AI call is planned.
### Ask Notes region and phase timing — 30 September 2026

Branch `codex/ask-notes-timing`, worktree `/private/tmp/netflux-ask-timing`, base
`73b8ad81`. Separate from first-paint PR #201. User authorized implementation and
production follow-up, with ordinary usage rather than repeated paid benchmarks.

Fresh unauthenticated production POST returned 401 and `sin1::iad1` execution;
Supabase project metadata reports `ap-south-1` (Mumbai). Scope: add the existing
`vercel.json` per-function `bom1` pattern for `/api/chat/notes`, and request-local
phase timing. No schema, provider/model, prompts, quota or security-order changes.

Durations cover client setup, initial auth, rate limit, live-session check, quota,
embedding, index search, evidence loading, selection, evidence recheck, repeat
index search and final auth. Provider phase durations include existing spending
bookkeeping; they are not pure model-inference times. `response_ready` includes
route preparation through deadline/spending wrappers, excludes module/cold-start
initialization before entry, network transit and stream consumption, and must not
be described as browser end-to-end latency. Unmeasured synchronous work remains
in total. Skipped phases are absent; timed-out in-flight phases are incomplete.

One fixed-shape `ask_notes_timing` log and a no-store `Server-Timing` header contain
only allowlisted phase names, numeric elapsed time, completion flags, status and
(in logs) execution region. No questions, evidence, account/session IDs, exceptions,
provider URLs or credentials. Headers permit ordinary-request inspection even
while Vercel historical-log access is billing-limited. Concurrent requests isolate
measurements; telemetry does not change security checks, original request identity,
response protocol/body or deadlines. Other retrieval callers collect no telemetry.

Targeted tests initially caught an unnecessary cache-header spelling change;
restore the existing `no-store` contract. Next: final focused tests/typecheck/lint,
built preview 401 probe confirming actual `bom1` execution and timing headers,
required checks and merge, then production verification. No paid AI call or new
Supabase project is necessary. Placement correction removes a known network
penalty; a seconds-saved claim and remaining bottleneck attribution require a
normal authenticated request after deployment. #28 remains open.

PR #202 is open at `7b7b8703`. Built preview
`dpl_6TPffSvwXtQYNvmqKKoqgQVsixkq` returned 401/UNAUTHORIZED from `sin1::bom1`,
`Server-Timing: client;dur=20, auth;dur=1, response_ready;dur=34`, and `no-store`.
No selection/provider phase ran. Evidence: `/private/tmp/netflux-ask-evidence/preview.json`.
61 focused tests and 67 related general/author-chat tests passed; typecheck/lint
passed. Scope is seven intended files. Required CI gates release; PR #201 was still
open at the last check. Next: finish #201, update #202 from merged main if required
(preserve both appended checkpoint sections), then merge and verify production
identity, bom1 execution, 401 and headers. The combined rollout monitor handles
both. This local checkpoint append is intentionally deferred to the final
production-evidence documentation PR to avoid another full application CI cycle.

Heartbeat 30 September 2026 09:05 UTC: #201 merged as `278ed105` with required PR
checks passed. Production still serves `aeb24f9a` on
`dpl_1jfJEcSs8o9CXy3eHsznUbGr1L2p`; #201 Vercel status explicitly waits for checks.
Merge CI run `36692350316` is in progress; Security Gates passed. Do not smoke-test
the old build as if it contained #201.

#202's original head passed all required checks but was behind main. Preserved the
intentional local checkpoint in a targeted stash and `/private/tmp/netflux-ask-evidence/checkpoint.patch`,
rebased onto `278ed105`, resolved only appended documentation sections retaining
both, compared all six non-document files against `7b7b8703` (identical), pushed
with force-with-lease and restored the local checkpoint. New head `4e705077`;
GitHub scope is exactly the same seven intended files and PR scope passed. Fresh
required checks are running; auto-merge remains enabled. No benchmark, AI call or
production change occurred. Next heartbeat: inspect #201 merge CI/deployment and
#202 refreshed checks, then carry out the already specified production smoke and
combined documentation follow-up when deployment identities are ready.

Heartbeat 30 September 2026 09:21 UTC: #201 production verification completed.
Alias www.netflux.blog serves READY deployment `dpl_AALPfWoh2ECz45qm6z1vKNuf86kp`,
commit `278ed105`. Public desktop/mobile smoke confirmed application CSS inline,
zero external stylesheet links on initial Home load, visible heading at opacity 1,
no horizontal overflow, high-priority Browse hero, and Home→Browse→Preview navigation.
Evidence: `/private/tmp/netflux-critical-evidence/production-smoke.json` (includes
verified identity). This is functional rollout proof, not a new latency benchmark
or multi-country proof. #202's refreshed validation is still running E2E; its other
required checks passed. Next: confirm #202 merge/deployment, perform its one free
401 region/timing probe, then publish the combined documentation-only evidence PR.

Heartbeat 30 September 2026 09:37 UTC: #202 merged as `40091c98`; refreshed required
PR checks all passed. Production still serves verified #201 (`278ed105`). #202's
Vercel status is explicitly “Waiting for checks to complete”; merge CI
`36696033204` is running and merge Security Gates passed. No production AI probe
was sent to the older build. Next: once the alias serves `40091c98` or a descendant,
perform the single 401/bom1/Server-Timing probe, then publish both rollout records
and the preserved local checkpoint in one documentation-only PR. Monitor remains
active; no failure or user decision currently requires a notification.


### Performance rollouts verified — 30 September 2026

Both rollouts are merged and production-verified. #201 is `278ed105`; #202 is
`40091c98`. Production now serves READY deployment `dpl_GGNWZgnjRZ4dbBnrthwHScq37rgb`
at `40091c98`, which contains both changes. Required PR and merge checks passed.

#201's desktop/mobile public smoke passed at its deployed identity, including
inline application CSS, absence of external stylesheet links on the initial Home
load, visible headings, no horizontal overflow, high-priority Browse hero and
Home→Browse→Preview navigation. #202's production unauthenticated POST returned
401/UNAUTHORIZED from `sin1::bom1`, no-store caching, and client/auth/response-ready
timings (6/1/11ms). No embedding or selection phase ran. Those numbers measure an
unauthenticated rejection, not a successful AI answer or a speedup claim.

Sanitized evidence: `docs/evidence/performance-rollouts-production-20260930.json`.
These checks establish rollout correctness from one test location, not global
latency or multi-country experience. Keep first-paint tradeoffs (larger HTML,
experimental inline CSS, warm-reload overhead, image-tail variability). The AI
region mismatch is corrected; remaining AI bottleneck attribution still needs
phase timings from ordinary authenticated usage. No paid AI calls, account creation,
production data changes, database migration or repeated capacity benchmark occurred.
#28 remains open.

This documentation-only follow-up uses branch `codex/performance-rollout-evidence`
in `/private/tmp/netflux-rollout-evidence`, based on `40091c98`, and carries the
intentionally preserved local checkpoint history above. Next: merge this evidence
PR through normal required checks, then remove the completed rollout monitor.


### Post-rollout bottleneck measurements — 30 September 2026

User requested measurements before expanding to worldwide performance. #201,
#202 and their evidence PR #203 are merged. Production identity confirmed as
`2080c578`, READY deployment `dpl_2FZnxz2TfzDbgZ5HuxNZEv5NmqT5`. The completed
rollout automation has been removed. #28 remains open.

Worktree `/private/tmp/netflux-performance-measurement`, branch
`codex/performance-measurement-followup`, based on freshly fetched `2080c578`.
Scope is evidence/documentation only. No application, model, prompt, authorization,
quota, schema or infrastructure changes.

First-load: reused #201's harness for three sequential cold/warm samples each of
Home, Browse and the same public reader route. Slowed mobile conditions remain
390x844, 200KB/s, 150ms added latency and 4x CPU slowdown. Median cold FCP:
Home 608ms, Browse 632ms, reader 1008ms; median cold LCP: 2248/3304/2956ms.
All 18 loads had inline application CSS and zero external stylesheets; overflow
and Browse hero-priority assertions passed. Warm medians FCP: 412/336/936ms;
LCP: 412/700/1288ms. Full ranges and conditions are retained in the evidence.

The original CSS-blocked first paint is removed in these samples. This does not
establish that the complete page becomes interactive at FCP, or that all first-load
bottlenecks are resolved. Browse's largest element remained an image; in the first
sample, the high-priority image response ended at 2989ms and LCP occurred at 3016ms.
Home's final LCP was a paragraph, with fonts arriving late in the resource waterfall.
JS transfer and long tasks continued after first paint. Those are the next specific
first-load candidates, not reasons to repeat capacity testing or upgrade hosting.
Historical baseline comparisons are contextual, not new controlled speedup estimates.
Opera activity overlapped part of this run, so host contention is a limitation.

Ask Notes: production log lookup first timed out; deployment-scoped retries returned
no matching logs, so used browser Network timings instead. The user signed into
Opera. Two related, ordinary questions returned HTTP200, displayed verified extracts,
and executed in `bom1` with `no-store`. Browser request durations were 15.77s and
14.94s; response-ready times 14.218s and 14.171s. Selection consumed 10.897s and
10.541s (roughly 74–77% of measured server time). Embedding took 592/612ms; index
search 116/67ms. Rate limiting took 834/827ms. Revalidation remained enabled.
Content download was below 3ms. No extra paid requests are needed to identify the
current dominant measured phase.

The region mismatch is corrected, but the AI wait is not resolved. Selection wraps
spend reservation, the provider call, structured-output parsing and settlement;
these timings do not isolate pure model inference. The two different questions
are not a controlled cold/warm experiment or a p95 sample. Browser request time
also excludes pre-request UI work and final rendering. Do not compare these with
the old 7.8–12.3s range as proof of either regression or improvement: requests,
account state and measurement boundaries differ.

Next recommendation: split selection timing into spending reservation, provider and
settlement before changing the relevance model/prompt. Evaluate one bounded
optimization against the existing relevance/exclusion contract. Keep security
checks and evidence validation intact. For first-load work, use a focused image/font
attribution experiment; preserve typography and design. Worldwide testing should
follow these local findings, not replace fixing the dominant measured work.

Evidence: `docs/evidence/performance-followup-20260930.json`. Raw public first-load
results and the exact adapted harness are in `/private/tmp/netflux-post-rollout/`.
Only sanitized timings are committed; no personal questions, saved excerpts,
credentials or citation links. Two paid application requests were made; exact cost
is unavailable. The Vercel CLI credential was unavailable for direct API inspection;
the connector supplied deployment identity. No database changes or new accounts.
Next action: publish this two-file evidence PR through normal gates, then use this
checkpoint for the targeted optimization decision. No recurring monitor is needed.

### Selection phase attribution — 30 September 2026

Branch `codex/selection-phase-timing`, worktree `/private/tmp/netflux-selection-timing`,
based on freshly fetched `2080c578`. Follow-up production measurements are preserved
separately in PR #204. Two successful authenticated responses measured roughly
10.5–10.9s selection inside 14.2s response-ready time. Do not call this pure provider
latency: the phase includes spending reservation and settlement.

Adds three fixed-name subphases: `selection_reserve`, `selection_provider`,
`selection_settle`. They are nested within existing `selection`, so never add them
to that parent when calculating total time. Provider timing includes SDK request,
response and parsing, not pure inference. No prompt/model, candidate selection,
spending enforcement, security order, response protocol or UI changes. No-op outside
Ask Notes request timing. Logs contain only existing allowlisted timing metadata.

Focused tests cover the actual generator with mocked provider/spending boundaries,
parent/child duration semantics, unchanged output, private-data exclusion, reservation
failure, cancellation before provider work, and provider failure. Existing timing
concurrency/deadline tests and frozen selector contracts remain in the targeted suite.
No paid model calls for this implementation. Next: required CI and deployment, then
one authenticated request to resolve provider versus bookkeeping attribution. Use
that result to pick a bounded optimization; no broad benchmark or model swap yet.
Browse image/font attribution remains the next first-load task. #28 remains open.

Heartbeat 30 September 2026 14:57 UTC: #204 merged as `5cf985b3`. #205 required
validation was still running and GitHub reported a documentation append conflict.
Rebased #205 onto fresh main, retaining both checkpoint sections. Compared all
three implementation/test files against `c7580441`: identical. Refreshed head
`978e7682`; four-file scope unchanged. Pushed with force-with-lease; required checks
must run on refreshed head. No paid request or production action. This local
checkpoint append is deferred to final evidence documentation, avoiding a second
application CI run solely for status text. Next: check exact-head CI/merge and
production identity, then perform the one authorized authenticated attribution
request only after the new timing fields are deployed.

Post-merge follow-up 30 September 2026: #205 merged as `066a672f` after passing
required PR checks. Production alias still serves #204 (`5cf985b3`, deployment
`dpl_9DEVbc4u1AWtW7SBZWfQpZKmXj5U`). Merge CI `36735447856` and Security Gates
`36735447763` remain in progress. Do not spend the one authorized authenticated
measurement on this older build. Monitor remains active; next action is confirm
new deployment identity, then capture the three selection subphases once.

Heartbeat 30 September 2026 15:36 UTC: production now serves #205 merge `066a672f`
on READY deployment `dpl_CV2gUmX5BTXknXErWbxFqHEtnh9j`. Merge Security Gates passed;
merge CI was still running when inspected. Attempted to open Notes in Opera, but
computer-use tool stopped on concurrent user activity; refreshed state remained
on the user's other page. No AI request sent. Asked user to open Netflux Notes and
reply ready when convenient; do not repeatedly interrupt their active browser.
The single paid attribution request remains unspent. Next: user-ready session,
measure once, record sanitized subphases and concrete recommendation.


### Selection attribution measured in production — 30 September 2026

#205 is deployed as `066a672f`, deployment `dpl_CV2gUmX5BTXknXErWbxFqHEtnh9j`.
Required PR and merge checks passed. After the user signaled ready, exactly one
additional authenticated Ask Notes request was submitted in Opera. HTTP200,
`bom1`, `no-store`, and the completed evidence response were observed.

Browser request duration: 13.36s; server response-ready: 11.705s. Selection total:
8.246s, including reservation 218ms, provider/SDK 7596ms, settlement 428ms.
Provider/SDK accounts for about 92% of selection and 65% of measured server time.
The three children overlap the selection parent; never sum both levels. The
provider measurement includes remote queue/network, inference and SDK parsing;
it does not isolate pure inference. This is attribution, not proof of a speedup:
#205 changes instrumentation only, and one sample cannot establish percentiles.

Other measured work: rate limiting 854ms, embedding 626ms, evidence revalidation
1071ms; initial index search 72ms. Browser-minus-server time is about 1.65s,
including uninstrumented startup/platform/network work. Download took 3.08ms.
Keep security and spending enforcement; they are not the dominant measured delay.

Next bounded optimization: inspect selector input/output size and propose a compact
assessment representation or lossless candidate deduplication, then evaluate one
candidate on a separate small development fixture before the existing held-out
relevance/exclusion gate. No model swap, removed constraint checking, smaller recall
pool or caching of private evidence is justified by this latency sample alone.
Do not rerun the full paid benchmark until a credible candidate exists. Preserve
all quality thresholds and failed cases. Browse image/font work remains next in
first-load performance; #28 stays open.

Sanitized evidence: `docs/evidence/selection-attribution-20260930.json`. No private
question, excerpt, account ID, cookie or citation link is included. The one-request
attribution allowance is consumed; no more paid requests for this measurement.
Worktree `/private/tmp/netflux-selection-attribution`, branch
`codex/selection-attribution-evidence`, base `066a672f`. This documentation-only
follow-up carries the deferred checkpoint history. Next: merge the evidence PR
through required gates and remove the completed attribution monitor; further
optimization is separate work, not a claim that the AI wait is resolved.

### Compact selector IDs development experiment — 30 September 2026

Worktree `/private/tmp/netflux-selector-compact`, branch
`codex/selector-compact-development`, based on `066a672f`. The user authorized a
bounded optimization after #205 attributed 7.596s to provider/SDK versus 646ms to
spending reservation/settlement. Production code remains unchanged.

Candidate: replace only opaque record IDs with request-local `c0`… labels, mapping
selected IDs back afterward. Keep candidate text/order/count, system prompt,
assessment fields, output cap, model, security requirements and expected membership.
Use six existing synthetic precision development cases plus the independent eight-
record capacity case. Deterministic UUID-shaped IDs replace toy IDs in BOTH arms.
Alternate arm order, one pair per case, maximum14 provider calls, no retry,20s
per-call deadline. No held-out cases are inspected or tuned against. The existing
production request builder and generator are reused by the experiment harness.

Frozen decision before provider run: reject candidate on extra/missing expected IDs
or structured-output errors. Advance only if output tokens and median latency both
fall, with full existing quality gates still required before release. This small
sample cannot establish production percentiles or global improvement. Tokens are
measured; actual billed cost unavailable. Direct development calls are outside
application spending scope, controlled by the hard14-call cap instead.

No-network plan and typecheck passed. Harness:
`scripts/experiments/selector-compact-ids.ts`; plan `/private/tmp/netflux-compact-plan.json`;
run `/private/tmp/netflux-compact-development-v1.json`. Next: inspect completed paired
results, retain failures, choose advance/reject rather than rerunning for better
numbers. #206 documentation merges independently; #28 remains open.


Development result: all14 calls completed without retry; both arms passed7/7 cases,
including the8-record capacity case. Median latency baseline6321ms versus compact
4529ms (28.3% lower); output tokens2896 versus2372 (18.1% lower), input17580 versus
16090 (8.5% lower). These are seven paired synthetic cases, one attempt per arm,
not field percentiles or proof of production savings. No actual billed amount is
claimed. Full per-case outputs/timings and frozen plan/hashes are retained in
`docs/evidence/selector-compact-ids-development-20260930.json`.

The planned development criterion passed. Next implementation must make the compact
mapping a shared, validated request transformation used by BOTH production and
provider evaluation. Reject unknown/duplicate labels; restore original IDs before
materialization, fingerprint rechecks or citations. Retain separate logical-request
and provider-wire hashes (or version the canonical wire contract) so old provider
responses cannot pass as evidence for changed wire inputs. Existing capture replay
currently verifies exact canonical request hashes and bypasses the default provider
generator; modifying only that generator would produce misleading benchmark proof.
Do not weaken those checks. No production selector code changed in this experiment;
full frozen quality and database-backed integration evidence remain outstanding.
Typecheck, targeted harness lint, no-network plan and diff checks passed. No new
accounts, database writes, infrastructure or additional production AI requests.

### Provider-boundary instrumentation — 1 October 2026

Branch `codex/selector-provider-boundary`, worktree
`/private/tmp/netflux-provider-boundary`, based on freshly fetched `5cb80ea5`.
User directed boundary measurement before further provider optimization. This change
adds no model calls, prompt/schema/model changes, candidate reduction, retries or
spending/security changes. Rejected response-format experiments remain separate.

The selector supplies a request-local fetch adapter to the existing provider SDK.
It passes the original fetch arguments/signal unchanged, forwards response status,
headers and body bytes, preserves body errors/cancellation, and does not pre-read or
clone the body. Outside Ask Notes timing scope the original fetch is used unchanged.
Fixed-name numeric spans use the existing private/no-store Server-Timing and timing
log path; no URLs, headers, credentials, prompts, bodies, IDs or provider errors are
recorded. Partial reads/errors retain incomplete markers, not false zero success.

Boundaries:
- `selection_sdk_prepare`: SDK invocation to fetch dispatch (SDK preparation,
  scheduling and request serialization, not isolated serialization CPU).
- `selection_headers`: fetch dispatch to fetch resolution/rejection; on success this
  is headers available. Includes network/provider wait, not pure network RTT.
- `selection_first_byte`: fetch dispatch to the first nonempty chunk observed by
  the SDK's body reader. Intentionally overlaps headers/body spans; never add it
  into total time. Consumer scheduling/buffering may affect it.
- `selection_body_read`: headers available to body EOF. Includes body waiting,
  transfer and SDK consumption/backpressure; not pure transfer throughput.
- `selection_sdk_finish`: body EOF to generateText completion/failure, including
  JSON/structured-output validation and SDK work, not isolated CPU time.

Installed Anthropic SDK uses `stream: false` for this generateText path. First
response bytes may therefore arrive only after full generation: this is NOT time
to first generated token and cannot independently distinguish provider queueing,
inference, DNS/TLS or network travel. No streaming switch is included. The existing
`selection_provider` remains the enclosing metric. Timings do not prove a speedup.

48 focused tests passed, including actual SDK structured-output parsing against a
synthetic local fetch, delayed headers/chunks, payload preservation, untouched
request identity, failure/cancellation, private-data exclusion and no-op outside
scope. Typecheck and full lint passed. Full unit suite: 1,618 passed, 277 database-only or otherwise conditional tests skipped as configured. No paid requests or production
changes performed. Next: required CI, deploy the instrumentation through normal
PR gates, then use ordinary authenticated usage to attribute the wait before any
new optimization. Do not run a paid quality benchmark for unchanged model inputs,
repeat previous format experiments, or close #28. One implementing agent.

Rollout monitor, 1 October 2026 01:15 SGT: #209 at `71469ba3` passed validate,
PR scope and Vercel preview. Security Validation failed at dependency audit before
runtime checks: installed Next.js 16.3.3 is affected by GHSA-vcvr-r3jv-pc5j
(Node.js next/og ImageResponse RCE with attacker-controlled SVG values). Advisory
lists 16.3.6 as patched; npm audit recommends available 16.3.8. No instrumentation
failure was reported. This does not establish exploitability of Netflux's routes.
#208 remains open; no existing dependency repair PR was found. A separate narrow
framework security patch is required before the rollout can proceed; do not waive
the audit or fold a general dependency upgrade into instrumentation. No production
or paid-provider actions were performed. This monitor append is intentionally
uncommitted until the prerequisite is resolved and the branch is refreshed.
Advisory: https://github.com/advisories/GHSA-vcvr-r3jv-pc5j

Security prerequisite prepared after explicit user instruction to proceed:
PR #210, `b524428a`, branch `codex/next-security-patch`, worktree
`/private/tmp/netflux-next-security`, based on fresh `origin/main` (`5cb80ea5`).
Only package.json/package-lock.json changed: Next.js + matching lint package and
Next.js transitive packages 16.3.3 -> 16.3.6. Production audit zero vulnerabilities;
1,613 unit tests and 34 capacity-harness tests passed (277 conditional skips),
full lint/typecheck/build including Sharp traces and critical-CSS checks passed.
No application/model/database changes or paid calls. PR checks pending. Merge #210
through existing gates, then refresh #208/#209 from patched main, preserving both
checkpoint sections and this intentional local append. Verify deployment only after
#209 merges; ordinary authenticated usage still supplies the new phase measurements.

Manual continuation after timers were paused: #210 merged successfully at
`b07432bb` with required checks passing. Refreshing #209 onto patched main and
committing the preserved monitor append with this existing release update.
Instrumentation implementation is unchanged from `71469ba3`; no additional paid
calls or production-data work. #208's evidence branch is being refreshed separately.
The recurring monitor remains PAUSED at the user's request; do not reactivate it.
### Response-design reassessment — 1 October 2026

Fresh-main branch `codex/selector-facet-references` at
`/private/tmp/netflux-selector-facet-refs` began from `5cb80ea5` after explicit user
authorization to reassess following two rejected candidates. The failed compact-ID
and fixed-slot implementations remain held on `codex/selector-compact-production`
(final fixed-slot checkpoint `32429800`); neither is production code.

Inspection of the fixed-slot comparison's baseline output found repeated facet text
represented 1,219 / 11,678 serialized output characters (~10.4%). Tested a different,
development-only response representation: replace repeated requestedFacet text with
a zero-based reference into the existing requestedFacets list, restoring the exact
text before the normal validator. Original evidence IDs, candidate passages/order,
reasoning fields, model and relevance rules were preserved. Facet bounds, duplicates,
unknown evidence IDs, strict fields and exact-quote/eight-assessment limits are still
validated. This does not fix the provider's array-bound weakness and does not claim
to. No application code, UI, database or deployment configuration changed.

Frozen development decision: all expected evidence with no extras, >=10% reduction
in total output tokens, lower combined tokens and lower median call duration. Used
the same independent seven development cases, fresh paired calls with alternating
arm order, 14-call cap, zero retries, existing 20s deadline. No held-out tuning.

Both arms passed all seven cases. Baseline: 17,580 input + 2,870 output tokens,
median 4,098ms. Facet references: 18,014 input + 2,626 output tokens, median 6,752ms.
Output reduction was only 8.5%; total tokens increased from 20,450 to 20,640.
**Reject under the predeclared rule.** The small timing sample is not proof of a
universal slowdown, but cannot justify a production speedup. No full 168-call gate,
paid retry, production request, new account or infrastructure action was performed.

Evidence: `docs/evidence/selector-facet-references-development-20261001.json`.
Harness and adapter are under `scripts/experiments/selector-facet-*.ts`; adapter hash
is retained with evidence. Three boundary tests, typecheck and focused lint passed.
Exactly 14 paid calls used 41,090 observed application-provider tokens in this pass;
actual dollars and Codex billing unavailable. One agent. Raw local artifact:
`/private/tmp/netflux-facet-development-v1.json`.

Next: keep the existing production response contract and stop protocol experiments.
The current evidence supports provider work as the dominant measured delay, but no
proposed format change has earned release. A further optimization needs a different
measured mechanism, such as stable versus request-varying provider schema overhead;
inspect actual serialized requests without sending them before proposing a bounded
comparison. Do not infer schema-compilation time from total provider duration or
claim that fewer output tokens guarantee lower latency. Publish this experiment and
its negative result through ordinary PR gates; no production smoke or deployment
wait is needed because application behavior is unchanged. #28 remains open.

### Provider-boundary production observation — 1 October 2026

#210 security repair merged `b07432bb`; #209 instrumentation merged `f506f6e1`;
#208 development evidence merged `76e05f6b`. Production domain `www.netflux.blog`
was verified before and after this observation on ready deployment
`dpl_4PjQUAQARLJyt69p4b6dJQA69pWM`, serving exact commit `f506f6e1` (including the
security patch). #208's later documentation/experiment merge was not required for
this measurement. User explicitly authorized one ordinary signed-in request.

Opera Network recorded one POST /api/chat/notes, HTTP200, no-store,
`sin1::bom1` ingress/execution, response Date 2026-10-01T03:37:33Z. Browser request
~17.90s (not complete question-to-render time); server response_ready 16,369ms.
Selection provider 11,808ms: SDK preparation 14ms, fetch-to-headers 11,773ms,
headers-to-body-EOF 3ms, post-body SDK handling 17ms. Fetch-to-first-observed-byte
11,776ms is overlapping and is not added to these stages. Selection spending
reservation/settlement 352/353ms. Full numeric phases are in
`docs/evidence/provider-boundary-production-20261001.json`.

About 99.7% of provider time elapsed before response headers. Local SDK preparation,
body consumption and final handling totaled only 34ms in this sample. This rules
those out as the dominant contributor for this request. It does NOT establish
whether the wait is network RTT, provider queueing, schema preparation or model
inference: generateText uses non-streaming provider responses. No first-token
measurement, provider-side processing metric or isolated connection timing was
obtained. This is one observation, not a p95, global test or controlled comparison
with earlier 7.6s/13.4s measurements. The response-format experiments remain rejected.

Exactly one paid call was made; no retries, new accounts, production writes outside
the normal Ask Notes operation, infrastructure changes or additional benchmarks.
No personal question/excerpts, signed citation URLs or credentials are recorded.
DevTools was closed after capture. Recurring monitors remain PAUSED.

Next diagnostic: obtain provider-side processing/queue timing if available, or
consider a separately scoped controlled streaming observation (retaining full
validation before displaying evidence) to distinguish initial response delay from
generation duration. Neither is implemented or claimed necessary as an optimization
from this sample. Do not tune prompts/models before that distinction. Publish this
two-file evidence record through normal gates; no documentation deployment wait or
additional paid probe is needed. Worktree `/private/tmp/netflux-provider-boundary-evidence`,
branch `codex/provider-boundary-evidence`, base `76e05f6b`. #28 remains open.

### Provider metadata investigation — 1 October 2026

Read-only follow-up after #211 merged `5261cd3e`. No provider calls, production
changes or timers. Inspected the deployed selector source and official Anthropic
API overview, streaming and structured-output documentation. Documented response
headers identify requests/workspaces and rate limits; no documented per-request
queue/prefill/generation breakdown was found. Existing application timing logs
retain numeric local spans only, not upstream headers; the captured production
observation cannot recover those discarded headers. Token usage is settled, but
usage counts do not establish phase durations.

A concrete additional hypothesis: the selector builds its output ID enum from
each request's candidate IDs. Anthropic documents first-use grammar compilation
and schema caching. This makes request-varying schema compilation a plausible
contributor, not a measured diagnosis. Source inspection alone cannot establish
cache misses or their cost. References:
https://platform.claude.com/docs/en/api/overview
https://platform.claude.com/docs/en/build-with-claude/structured-outputs
https://platform.claude.com/docs/en/build-with-claude/streaming

Next bounded diagnostic: a single streaming observation measuring dispatch,
headers, first nonempty text delta, final delta and complete validated result,
with the existing model/prompt/evidence/schema and zero retries. Initial protocol
events must not be called first-token output. Preserve authorization, spending,
final validation and no partial user-visible evidence. A local synthetic probe
would not reproduce Mumbai production network timing; record its location and
limits if chosen. Do not infer pure network/queue/prefill separation or compare
this as a controlled speedup against a different earlier request. No streaming
implementation or paid observation was performed in this read-only pass.

This is an intentional uncommitted checkpoint append in
`/private/tmp/netflux-provider-boundary-evidence`, branch
`codex/provider-boundary-evidence` (merged PR #211). Carry into the next focused
follow-up rather than reopening the merged application/evidence scope. #28 open.

### Single streaming diagnostic — 1 October 2026

User explicitly authorized a paid diagnostic. Fresh-main worktree
`/private/tmp/netflux-stream-diagnostic`, branch `codex/selector-stream-diagnostic`,
base `5261cd3e`. Carried the intentional read-only checkpoint above. No application
code changes, deployment, data writes, timer or agent delegation.

Harness: `scripts/experiments/selector-stream-diagnostic.ts`. Reuses the existing
synthetic eight-greenhouse-procedures development fixture with the same deterministic
UUID-shaped IDs used in earlier development runs, unchanged production model, prompt,
schema builder and final selection validation. Only generation transport is streaming.
One direct development call outside application spending accounting, 20s selector
deadline, maxRetries0 and one-fetch cap; exclusive output creation prevents overwriting
evidence accidentally. Secrets loaded without printing. No personal evidence used.

Offline real-SDK/SSE plumbing check, typecheck and focused lint passed. Initial
offline invocation omitted Node's react-server condition and failed before any
provider call; rerun with that condition passed. This is harness setup, not a
product failure or paid retry. No broad quality gate: no production candidate.

Paid observation: HTTP200; dispatch10ms, headers1247ms, first actual text1273ms,
last text6009ms, stream end6019ms, validated6020ms. All eight expected records
selected with no extras. Input3055/output906 tokens (3961total); exact billed cost
unavailable. No server-timing header present. Exactly one paid call, no retry.
Sanitized evidence: `docs/evidence/selector-stream-diagnostic-20261001.json`.

Inference limited to this local synthetic observation: approximately4.75s (79%)
elapsed after first text, so response generation/delivery dominates this sample.
Early headers/text do not support a many-second pre-generation stall here. Neither
interval isolates inference from network; this does not establish why the different
Mumbai production request took11.8s. No cold/warm schema comparison or pure network
measurement was made. Streaming alone does not make fully validated evidence ready
earlier; partial structured output remains unsuitable for user-visible evidence.

Next decision: avoid further transport-only optimization on this evidence. Any
response-generation change must earn quality acceptance; the three rejected format
experiments remain rejected. A smaller required reasoning output is a possible new
quality/latency tradeoff, not authorized for release by this one fixture. Alternatively
retain output and improve factual progress feedback while production timing accrues.
Do not repeat this request to obtain favorable timing. #28 stays open; timers paused.

### Faster-model comparison — 1 October 2026

User authorized the bounded comparison. Worktree `/private/tmp/netflux-model-comparison`,
branch `codex/selector-model-comparison`, initially fresh-main `5261cd3e`, refreshed
to `7d844fb1` after #212 merged. No application changes; #213 remains a separate
negative prompt experiment record. One agent, no timer or production-data work.

Confirmed frozen corpus-v2 thresholds before calls: overall/class recall95%/90%;
per-run overall/class90%/85%; irrelevant rejection and abstention95%, each90%
per run; quote fidelity and forbidden-evidence exclusion100%; three independent
runs per case. Also retain complete extract grounding/attribution/coverage and
no unexplained regression. Passing seven development cases never releases a model.

Provider model-list GET verified GPT-6 Luna available; official model documentation
describes focused high-volume use and supports reasoning none. Installed SDK
requires explicit forceReasoning for this newer model: an offline intercepted
request confirmed model, reasoning none, store false and strict JSON schema,
without networking. Haiku remains the production baseline. Logical prompt,
candidate passages/IDs, schema and final selector validation unchanged.
Candidate provider-native schema encoding can differ; this is a model/provider
configuration comparison, not isolated pure-model throughput.

Harness `scripts/experiments/selector-model-comparison.ts` reuses seven synthetic
development cases; alternating fresh baseline/candidate calls,14 maximum, no
retries,20s deadline and stop on first quality failure. Predeclared advance rule:
all expected IDs and no extras in all cases, median at least20% faster, faster in
at least5/7 pairs, no higher estimated token cost. No held-out corpus tuning.
Typecheck, focused lint and offline request preflight passed.

Completed14calls, both arms7/7 valid correct selections. Haiku median3967.94ms,
17580input/2928output tokens. Luna median4814.98ms,13223input/2487output tokens;
faster in3/7 pairs only. **Reject for latency objective:** median21.35% slower.
Standard token-price estimates: Haiku$0.032220, Luna$0.0025658, combined$0.0347858;
actual billed invoice unavailable. Rates and source links recorded in evidence;
no cache-read tokens observed. Total observed provider tokens36,218.

Evidence: `docs/evidence/selector-model-comparison-development-20261001.json`;
raw artifact `/private/tmp/netflux-model-comparison-v1.json`. All responses are
synthetic, not private user content. Slower calls retained. No repeated favorable
sampling, full168-call evaluation, release model change or production probe.
These are seven local pairs, not production percentiles or all-times provider
speed conclusions. No numerical acceptance thresholds changed.

Next: retain Haiku. This candidate offers lower estimated cost but did not satisfy
the requested latency objective. Do not keep cycling models without a new bounded
decision. User-visible factual progress or eliminating demonstrated non-provider
serial work are distinct next options; neither resolves provider generation time.
Publish this negative result through normal gates. #28 stays open, timers paused.

### Luna structured-output failure diagnosis — 1 October 2026

User authorized a narrow diagnosis of #215's failed quality run. Fresh-main
branch `codex/luna-failure-diagnosis`, worktree `/private/tmp/netflux-luna-diagnosis`,
base `12d7c4a5`. #215 still holds the original failed evaluation independently.

One paid request for the identical synthetic `comparison-larch` logical input and
candidate configuration. Frozen capture validation and candidate hash match
`0fb4fee2daf4cc762f5fba6082fa7f4836e8f5e2775788a90779be43f17e44fb`.
Prompt, model, schema, reasoning none,1600output cap,20s deadline unchanged.
No provider retry or full benchmark. Captured only synthetic response body, not
request headers/keys. Offline planning, typecheck and focused lint passed.

Diagnostic succeeded in5373ms. HTTP completed response, finish stop, no provider
error/incomplete details, one message and zero hidden reasoning tokens. All
required fixture evidence selected, no ineligible selections. Replaying the exact
response through the same SDK and application validator passed offline (zero
network calls); wire-hash equality was enforced. This disproves a consistently
failing SDK/schema path for this input, not the original intermittent failure.

Usage10625input (10622cached)/342output; standard price estimate$0.00027752,
not an invoice. Cache hit makes this unsuitable for cold performance comparison.
Raw original failed response was never retained and cannot be reconstructed.
Its different788output tokens cannot establish what text or failure occurred.
**Root cause remains unknown; original frozen evaluation remains failed/incomplete.**
No successful diagnostic may be spliced into it or used to authorize a model switch.

Harness `scripts/experiments/luna-failure-diagnostic.ts` supports explicit capture
and failed-evaluation paths and offline replay of its local artifact. Evidence
`docs/evidence/luna-failure-diagnostic-20261001.json` preserves the synthetic raw
provider response, parsed assessment, usage, config and offline replay result.
Raw local artifacts `/private/tmp/netflux-luna-failure-diagnostic-v1.json` and
`/private/tmp/netflux-luna-failure-replay-v1.json`. Exactly one paid call, no retries,
one agent, no production data/DB/infrastructure/model change; timers paused.

Next: do not run another full quality attempt merely because this diagnostic
succeeded. Luna remains held. Any reliability change (for example a bounded retry
of transient structured-output failures) is a distinct latency/cost/failure-policy
decision that needs explicit recorded semantics and validation without hiding
first-attempt failures. No such behavior is added by this evidence PR. #28 open.

### Continued Luna diagnosis and corrective candidate — 1 October 2026

User explicitly instructed continued diagnosis/fixes, rather than stopping at a
release blocker. Fresh-main branch `codex/luna-response-investigation`, worktree
`/private/tmp/netflux-luna-response`, base `f3910621`. No production change.

Five bounded reproductions of comparison-larch all succeeded. An initial command
omitted inherited Node server conditions and stopped before provider/network work;
corrected invocation made exactly five calls, no provider retries. Artifacts
`/private/tmp/netflux-luna-reproduction-{1..5}.json`. This does not repair #215.

Source inspection and offline actual-SDK replay demonstrated a compatibility
problem: generateText concatenates text across response messages, so documented
commentary followed by valid final-answer JSON fails JSON parsing. Experimental
`luna-final-phase.ts` accepts one explicitly final message, excludes only explicit
preceding commentary, preserves usage, and rejects ambiguous/missing finals and
malformed JSON. No arbitrary text repair or first-valid-JSON extraction. Seven
SDK-backed offline regression cases now include incomplete-provider rejection.

Fresh phase-aware none-reasoning evaluation stopped at call104/168 on run2
abstain-glossary-no-value. First run had100% selector recall/rejection/abstention/
quote-target metrics. Three real multi-message responses were handled, but the
new failure is independently captured: provider status incomplete, reason
max_output_tokens, one commentary message repeatedly emitting JSON-like objects,
no final answer,1600output tokens and zero reasoning tokens. The adapter correctly
rejected it. This observed provider-output failure is not inferred from a missing
original response. Original comparison-larch failure still cannot be reconstructed.
Raw artifact `/private/tmp/netflux-luna-phase-quality-v1.json`; exact executed
runner saved `/private/tmp/netflux-luna-phase-quality-executed.ts`. Failed usage
was absent from initial totals but remains in captured raw response: add9534input/
1600output for any total-cost calculation; never silently relabel original totals.

One diagnostic with reasoning low on that same failed input returned valid
abstention in3253ms,131output tokens. This is diagnosis only, not held-out quality
qualification. Seven separate development cases then passed7/7; median4871ms,
13223input/2785output tokens, standard uncached estimate$0.0027148 versus prior
Haiku$0.032220. No speed claim; user accepted cost-focused evaluation.

Earlier checkpoint (now completed below): fresh three-run evaluation at reasoning low with the guarded phase
adapter, same prompt/schema/output cap/deadline/quality floors; max168 calls, no
retries. Raw `/private/tmp/netflux-luna-low-quality-v1.json`; runner
`scripts/experiments/selector-luna-phase-quality.ts`; process session74193 at launch.
Plan `/private/tmp/netflux-luna-low-quality-plan-output.json`. Complete error/raw
synthetic response capture now includes phase-boundary errors and provider usage;
multiple-message success bodies are retained as well. Read artifact/process before
resuming; never restart a paid run after compaction. Next: inspect complete result
or exact first failure; only if passed proceed to database/renderer integration
verification and release. UI progress remains conditional; no partial assessment
is user-visible. Timers paused, #28 open. No new account/DB project or sudo needed.


### Luna correction qualifies for application rollout — 1 October 2026

Completed the continued diagnosis rather than stopping at the first failed gate.
Low reasoning with the explicit-final-phase adapter completed **168/168 independent
provider calls**, 56 cases across three runs, zero retries or provider failures.
Every selector metric was 100% in each run. Observed usage:886776 input and30584
output tokens; median2911ms is a synthetic, cache-influenced observation, **not a
production speedup claim**. The earlier39-call and104-call failures remain failures.
No successful output was substituted into either.

Integration adds an explicit selector-only environment override
`PERSONAL_EVIDENCE_SELECTOR_MODEL=gpt-6-luna`. It retains the evaluated prompt,
schema, candidates,1600 output cap,20s deadline, no retries, low reasoning,
forceReasoning and store:false. Default remains the existing Haiku configuration.
Unrecognized overrides or missing OpenAI configuration fail closed. The final-phase
adapter discards only explicitly identified preceding commentary; ambiguous,
incomplete and malformed finals still fail.

Spending admission includes reviewed OpenAI standard Luna prices:
$0.10/M input,$0.01/M cached input,$0.50/M output; above272000 input tokens, input
and cache rates double and output multiplies by1.5. The full1050000-token context
is conservatively reserved at the higher tier ($0.2112 with1600 output tokens);
actual valid usage settles at its correct tier. Failed/unknown-usage calls retain
the reserve. Daily policy/guest limits are unchanged. Pricing source:
https://developers.openai.com/api/docs/models/gpt-6-luna (checked1October2026).
No database migration is needed.

Offline conversion verifies original request/config/adapter/harness hashes before
binding each unchanged provider response to the shared application configuration.
The disposable local Supabase gate passed175 tests (174 case-runs plus aggregate),
with100% recall, irrelevant rejection, forbidden-evidence exclusion and exact-quote
fidelity in each run. This includes real Auth/session lifecycle and rendered
extract capture. It made **zero additional paid calls**. CI replays the same
qualified fixture alongside the existing Haiku fixture.

Evidence:
- docs/evidence/luna-phase-none-failure-20261001.json (failed, preserved)
- docs/evidence/luna-low-development-20261001.json
- docs/evidence/luna-low-quality-20261001.json
- docs/evidence/luna-low-database-20261001.json
- tests/fixtures/retrieval/provider-selections-v2-luna-low.json

Local full lint/typecheck passed;1633 unit tests passed,277 conditional skips;
34 capacity-harness tests passed. Seven adapter tests use the actual installed SDK
offline. Focused accounting tests cover both sides of272000 input tokens.

Next: inspect/publish this focused correction PR, retain required gates, verify
the production OpenAI configuration before enabling the selector override, then
perform a bounded production smoke. Factual progress UI is still outstanding and
will follow the qualified model change. No model/provider output is streamed as
evidence before validation. No production changes yet, timers paused, #28 open.

Rollout checkpoint: PR #217 https://github.com/Jseow008/ThePlayBook/pull/217,
head efda11aa, published from this worktree. GitHub20-file scope matches the
inspected local scope; PR scope passed; squash auto-merge enabled. Full required
validation/security and preview are running. Vercel CLI62.1.0 authenticates as the
existing project owner; production OPENAI_API_KEY presence confirmed through env
metadata, without retrieving its secret. PERSONAL_EVIDENCE_SELECTOR_MODEL is not
yet configured. No production action so far. An additional offline provenance
regression passed after the full suite (1634 total current tests including it).
This paragraph is an intentional uncommitted continuity append, not a reason to
rerun application CI. artifacts/ contains local replay inputs/results only.
Next: resolve only actionable CI failures; after gates pass enable the production
selector override and verify the deployed commit/config and one real Ask Notes
request. No additional full paid evaluation is needed. Preserve this append in a
subsequent evidence update.

Latest release state: Security Validation passed (6m16s), Catalog Search Evidence
and Vercel preview passed. validate is in Test (E2E); no actionable failure known.
Offline actual-production-generator smoke also passed: one fake transport call,
no network, correct low/store:false/1600/json_schema wire settings, explicit
commentary removed and selected IDs unchanged. Artifact:
artifacts/luna-production-wire-smoke.json. The disposable selector DB was stopped
with its data retained; other local Supabase projects untouched. Estimated standard
cost for168 calls with observed600379 cached input tokens is$0.049935; uncached
estimate$0.103970. These are token-price estimates, not billing records.
Production rollback reference saved at /private/tmp/netflux-luna-pre-rollout.json:
dpl_EJoZbx9WBYgfBuU6C1uUQYsCvSJK. Production model override remains UNSET; Haiku
still active. CLI inspect summary omits commit metadata: use the deployment API
for commit identity before claiming rollout. Opera Ask page is available, but
fresh authenticated smoke must occur only after the qualified deployment.
No recurring monitor was created or resumed.

Status check after merge: #217 merged as e92764382f44126e879f34404d745e7bb599da5e
at2026-10-01T07:15:37Z; all PR required checks passed. Production alias still
serves f3910621 (dpl_EJoZbx9WBYgfBuU6C1uUQYsCvSJK), override absent. Post-merge
Security Validation passed, but Catalog Search Evidence failed before testing:
Docker could not bind runner port54322 (address already in use); artifact-upload
failure is downstream of setup. Run36829303959 failed jobs retried once under
standing release authorization; no application change, paid call or gate bypass.
Post-merge CI also remains in progress. Next: check this bounded retry and deployment
before the previously authorized production model enablement/smoke.

Confirmed follow-up: run36829303959 attempt2 succeeded, including Catalog Search
Evidence and Security Validation; post-merge CI also succeeded. Production alias
www.netflux.blog serves e92764382f44126e879f34404d745e7bb599da5e, deployment
 dpl_8RWj4fZD6bG2fcbC3wxAc77YrCgT READY. Production OPENAI_API_KEY exists, but
PERSONAL_EVIDENCE_SELECTOR_MODEL remains absent. Therefore #217 code is deployed,
while the existing Haiku selector remains active. Next authorized step: enable
production-only Luna override, deploy that configuration through normal gates,
and perform one authenticated smoke; then address factual progress feedback.
No further full paid benchmark needed; no production mutation during this check.

### Luna production rollout and factual wait feedback — 1 October 2026

Authorized production-only PERSONAL_EVIDENCE_SELECTOR_MODEL=gpt-6-luna setting
added. Redeployed already-gated merge e9276438 as
dpl_NuQhhxkKA2QYK1h62wxLicgK3deF; www.netflux.blog now serves that READY deployment.
One ordinary signed-in Ask Notes request returned200 with an attributed extract
and a passage link; opening that link resolved to Verified passage. No saved
notes were created/edited; the request exists in the ordinary chat history.

Response metadata: no-store; bom1 execution (sin1 ingress); response_ready9585ms,
selection_provider5158ms, selection_reserve385ms, selection_settle169ms,
selection_headers5122ms, SDK preparation18ms and completion15ms, body-read3ms.
Browser Network panel showed roughly11.8s overall. This is one smoke sample,
not a controlled speed comparison or worldwide performance proof.
Read-only spending-ledger verification: provider openai, model gpt-6-luna,
1891input/288output tokens,211200microUSD conservative reserve settled to334
microUSD ($0.000334 accounting estimate, not provider invoice).

The console observer was NOT installed: browser paste protection prevented it.
Used the ordinary Network panel instead, without bypassing that protection.
Only sanitized status/timings/counts are retained; no credentials, excerpts or
citation tokens are stored in evidence. Diagnostic tab closed afterward.

UI follow-up in Codex worktree
/Users/j/.codex/worktrees/ask-progress/Lifebook, branch codex/ask-progress:
preserves layout and models, shows actual submitted/receiving status plus elapsed
client wait, and keeps feedback visible through an empty assistant stream start.
No inferred backend stages, ETA, partial model judgments or progressive evidence
delivery. Elapsed seconds are hidden from screen-reader announcements; the polite
status changes only at request boundaries. Timers are component-local, cleaned
up on finish/error/unmount, not recurring verification automations.
Focused delayed/error/retry, page/sidebar/mobile and scope-switch tests passed.
No additional paid model evaluation or database migration required. #28 open.

### First-load completion follow-up — 1 October 2026

User requested closing the unfinished original objective before more AI experiments.
Active worktree /Users/j/.codex/worktrees/first-load-completion/Lifebook,
branch codex/first-load-completion, refreshed onto origin/main23bdaf05. No agents
were spawned, paid calls made, database changes performed or monitors enabled.
#28 remains open. #218 merged as23bdaf05; production still served e9276438 at the
latest deployment check. Its intentional local continuity append in ask-progress
is superseded here without restarting that application CI.

Fresh public mobile trace reproduces late fonts/focal image while initial JS shares
bandwidth. The largest production chunk contained Sentry; existing removal of
unused tracing applied only to Webpack, while production builds use Turbopack.
Candidate applies the same false tracing/debug constants through compiler.define,
preserving error reporting. It also supplies400px device and256px image variants,
keeping layout, fonts, source artwork, quality75 and access behavior unchanged.
Compressed initial Home JS dropped18243bytes in matched build output. Synthetic
uncaught errors were intercepted locally: built Sentry capture works on390/1440px,
no transaction event; Home→Browse→Preview and overflow checks pass.

Production builds, typecheck, focused lint and18 tests pass. Initial external
node_modules symlink was rejected by Turbopack; replaced with a local copy before
building. No application workaround was added. The local paired timing comparison is INVALID: the copied baseline omitted its
public/ directory, causing image request failures. Original observations are
retained in [evidence](evidence/first-load-completion-development-20261001.json)
for transparency, not performance acceptance. The failure surfaced in server
shutdown output. The harness now rejects failed image/font/script/stylesheet
responses. No local benchmark rerun is needed: the complete hosted-deployment
comparison below supersedes it. The independent build-byte comparison and actual
candidate error-capture/navigation checks remain valid.

STATUS.md and #25/#28 register rows now distinguish current evidence from older
historical failures and still-open acceptance. #7/#11/#19/#29/#30–32 need evidence
reconciliation; product experiments and full history remain deferred. No audit
finding is silently closed by this performance change.

Next: publish the focused candidate, inspect its built preview against the pinned
production baseline with explicit hero completion and early navigation, verify
#218's deployment and controlled wait UI without a paid request, retain gates,
then record what is actually improved and the remaining first-load limitations.

Release handoff (intentional uncommitted evidence append; do not restart app CI
solely for this paragraph): #219 https://github.com/Jseow008/ThePlayBook/pull/219,
head97197b6f, seven-file scope inspected locally/GitHub, PR scope passed. Preview
 dpl_CHgzirHzx99X9jrqXARg1V4wBpXW READY. Hosted comparison completed24 observations
against e9276438 production deployment, artifacts under
/private/tmp/netflux-first-load-completion/hosted and hosted-summary.json.
Focal hero bytes42042→20304. Focal response ends across three cold samples:
baseline1257/1204/3215ms, candidate3972/1505/1356ms. Retain the first cold image
transformation; don't claim consistent speedup. Home LCP2632/2228/2232ms versus
2956/1244/2340ms also does not establish a consistent win. Lower bytes are proven;
the complete first-load objective remains open. No repeated benchmark for this patch.

Hosted desktop/mobile Home→Browse→Preview passed, screenshots inspected. Initial
interaction harness requested a desktop-only carousel indicator on mobile and
stopped; corrected navigation-only check passed. Reported5.7–5.8s navigation
completion includes waitForURL's load wait, NOT first heading visibility or TTI.
The saved early-interaction.json label was corrected to
browseNavigationLoadCompletedMs to prevent misinterpretation. No production defect was inferred from that
harness timeout. Built browser error capture proof remains local/intercepted.

PR description carries these final observations; squash auto-merge requested after
scope/preview validation. Full CI/security remain pending. Production still serves
 e9276438 at the latest check, so #218 deployment/controlled UI smoke remains pending.
Next action: inspect actionable #219 checks; verify #218/#219 production identity
once deployed, no paid requests; preserve this checkpoint and hosted summaries in
a documentation follow-up. Then bound remaining font/JS investigation with explicit
user-visible readiness measurements. Do not call all32 findings or first-load UX
complete, close #28, enable monitors or switch models.


### 1 October 2026 — visible Home content during entrance motion

Worktree: /Users/j/.codex/worktrees/font-loading-followup/Lifebook;
branch codex/font-loading-followup, based on main a012117b. This supersedes the
pending deployment state above: #219 merged as 8918c7f4 and www.netflux.blog was
verified serving that commit. #220 merged as a012117b with passing required checks;
its three-file narration-temperature/top-p change, test and OPS update have no
first-load conflict. The production alias still served #219 at this inspection,
so #220 production deployment is not yet confirmed.

A bounded anonymous production probe (390x844, 200KB/s down, 150ms latency,
4x CPU) found Home FCP 1372ms, headline opacity above .95 at 1776ms and paragraph
at 1958ms while fonts were still loading; final paragraph LCP was 2972ms and font
completion 3264ms. Browse FCP was 1152ms, heading visible at 1998ms and font
completion 4232ms. These single samples identify mechanisms, not user averages.
The probe's Playwright screenshots waited for fonts and are not early-frame proof.
Raw local observations: /private/tmp/netflux-font-attribution/result.json.

Home's CSS deliberately hid and blurred the already-rendered headline, description
and actions during a 780ms entrance plus stagger delays. The focused correction
keeps them opaque and unblurred throughout, retaining upward motion, timing,
layout, typography, colors and copy. The existing landing browser test now pauses
animations at time zero and asserts opacity 1/filter none. It fails against the
current production baseline (actual opacity 0), then passes on the candidate.
All eight focused Home/Browse/CTA/chrome tests passed on desktop and mobile,
without retries. Production build/typecheck, focused lint and diff validation
passed. Desktop/mobile screenshots were inspected; mobile has no horizontal
overflow or framework error overlay. No paid calls, database changes, new agent
or recurring monitor was used; #28 stays open.

This proves removal of an intentional visibility delay, not a measured overall
production speedup. Font swaps, shared resource bandwidth and remaining JavaScript
long tasks still need attribution before declaring the full first-load objective
complete. Next: publish this focused PR, preserve required gates, then verify its
deployed initial animation state. Reuse #219's completed hosted evidence; do not
repeat broad benchmarks or fold in unrelated audio/model changes.


### 1 October 2026 — font-priority investigation concluded without rollout

#221 merged as 5898255b and production www.netflux.blog now serves that commit,
including #220. The initial-animation visibility check passes in production on
both desktop and mobile (two tests, zero retries). This supersedes the pending
release state and intentional local append in font-loading-followup.

Worktree /Users/j/.codex/worktrees/route-font-priority/Lifebook,
branch codex/route-font-priority, based on fresh main 5898255b. No agents, paid
calls, database changes or recurring monitors. #28 remains open.

Consumer inspection corrected the earlier simplification: Playfair is also used
by Browse cards and onboarding, so it must remain available. Two bounded candidates
were evaluated without changing families, sizes or layout:

1. Route-specific next/font preloading correctly prioritizes Home Playfair and
   Browse Outfit, but separate preloaded/non-preloaded instances emit distinct
   URLs for the same Playfair bytes. Cold Browse followed by Home requests both
   forms. Reject this approach rather than introducing cache duplication. An
   initial navigation fixture attempted a Browse logo that leads to Browse and
   encountered onboarding; it was discarded, then replaced with direct page
   navigation for the specific resource check.
2. Shared Outfit preloading avoids separate font instances. Production build
   passes. Twelve local cold observations alternate baseline/candidate order,
   three per route and variant, at 390x844, 4x CPU, 150ms/200KB/s. Baseline built
   application matches main (#221); complete public assets are served. Initial
   preflight rejected local Vercel telemetry-script 404s. The two unavailable
   platform scripts were explicitly stubbed equally on both before measurement;
   other critical asset errors still fail the run. No favorable-result reruns.

Median results (milliseconds):

| Metric | Baseline | Shared Outfit preload |
|---|---:|---:|
| Home Playfair completion | 1242 | 1348 |
| Home Inter completion | 1452 | 1519 |
| Home FCP / LCP | 556 / 556 | 580 / 580 |
| Browse Outfit completion | 2338 | 1198 |
| Browse Inter completion | 1482 | 1618 |
| Browse FCP / LCP | 600 / 944 | 616 / 1012 |

The shared candidate adds 32528 bytes of early font traffic on Home. Reject it:
it exchanges earlier Browse typography for later Home fonts without improving
visible-content timing in this small sample. All application edits were reverted;
only this checkpoint and [development evidence](evidence/font-priority-development-20261001.json)
are published. Raw scripts/rejected patch remain under
/private/tmp/netflux-font-attribution. Existing local ServerResponse listener
warnings remain unresolved; these experiments change no server runtime logic.

Next: inspect the shared initial instrumentation/framework JavaScript chunk and
PostHog loading path for safely removable or deferrable work. Preserve early error
capture, analytics identity ordering and existing product behavior. Use a small
built comparison for one credible candidate; do not repeat font experiments or
claim the full first-load bottleneck is resolved. Deployed #221's removal of the
intentional reveal delay is verified; the wider objective remains open.


Handoff (intentional uncommitted continuity append): PR #222 at40309169,
https://github.com/Jseow008/ThePlayBook/pull/222. Two-file docs/evidence scope
confirmed locally and on GitHub; PR scope passed, squash auto-merge requested.
Required validation/security pending. Local browsers and servers stopped. Next:
review the instrumentation/analytics loading boundary using the attribution
already recorded, and propose one bounded JS candidate. No additional font
benchmark or production test is required for this documentation-only PR.


### 1 October 2026 — initial analytics JavaScript investigation

Application experiment branch codex/initial-analytics-js in
/Users/j/.codex/worktrees/initial-analytics-js/Lifebook, based on5898255b; all
candidate source/test changes were reverted after rejection. No production
settings, data or models changed, no paid calls, agents or monitors. Local
servers/browsers stopped. #28 remains open.

Installed PostHog1.393.0 exposes a slim entry point and extension bundles.
Repository uses explicit event/pageview/identify/reset helpers. A sanitized read
of the current public project configuration confirmed surveys, sessionRecording,
productTours, conversations and autocaptureExceptions false. Candidate preserved
AnalyticsExtensions, FeatureFlagsExtensions and ToolbarExtensions; Sentry initial
capture was untouched. Experiments:

- Packaged slim SDK plus retained extensions: build passes, but matched Home
  initial-script gzip total increases417140→421780bytes (+4640bytes, 17 scripts
  each). Reject, without a latency benchmark. The combined extension bundle does
  not give the required byte reduction in this application build.
- Direct installed extension-module imports: compilation succeeds but TypeScript
  fails because distributed and source-module PostHog types contain incompatible
  private members. Reject rather than casting away the compatibility boundary.
  This second approach was not runtime-accepted or production-built successfully.

First candidate verification: six unit tests passed, including real SDK anonymous
→ identified → reset pageviews with captured events suppressed before delivery.
Browser suite10passed/2failed: event delivery/one-pageview assertions reached
success, but final zero-CSP-warning assertions failed on local report-only inline
script warnings. Do not describe that suite as fully green or attribute the
warnings to this candidate without a baseline. The analytics fixture's OTP call
was intercepted locally; no email/account action was needed. All test edits were
reverted with the rejected candidate.

Raw evidence and rejected source: /private/tmp/netflux-js-attribution/size.json,
unit.log, browser.log, build.log, build-direct.log and rejected-direct.patch.
No shipping performance change or production speedup is established. These two
attempts close this packaging approach for now. Next decision: preserve current
observability and inspect route-specific interactive components for genuinely
avoidable initial work before choosing another implementation. Delaying the whole
analytics SDK would risk losing short visits and requires an explicit product
tradeoff; do not silently do that to improve a benchmark. Do not repeat the font
or SDK packaging experiments.


### 1 October 2026 — skip mobile carousel-arrow measurements

Worktree /Users/j/.codex/worktrees/browse-lane-rendering/Lifebook,
branch codex/browse-lane-rendering, based on freshly fetched main411db433 (#222).
No subagents, paid calls, production writes, database changes or monitors.
#28 remains open; production #221 initial visibility is already verified.

The proposed offscreen-lane containment preflight was not promising for the
current catalog. Once streaming settles, Browse has two active lanes (top about
501px/859px, height326px at390px width). A temporary browser-only content-visibility
auto check leaves both rendered; neither is far enough away to skip. The earlier
42-link transient DOM count was not proof of42 simultaneously rendered cards:
settled active lanes contain10cards each. No containment CSS or placeholder
heights are shipped, and no full containment benchmark was run.

A concrete avoidable cost exists in ContentLane: mobile CSS hides both arrows,
but their scroll-width measurements, scroll/resize handlers and per-card resize
observers still initialize. Candidate attaches those only while the existing
md breakpoint (768px) matches, disconnects on entering mobile, and restores
measurements on desktop. Native mobile scrolling, SSR content, dimensions, fonts,
card links and desktop behavior remain unchanged.

Built-browser baseline/candidate comparison, one observation per viewport:

| Build | Width | Active lane resize targets | Observe calls |
|---|---:|---:|---:|
| Main application baseline | 390 | 22 | 22 |
| Candidate | 390 | 0 | 0 |
| Main application baseline | 1440 | 22 | 22 |
| Candidate | 1440 | 22 | 22 |

Baseline build from font-loading-followup has the same application as main411db433
(the intervening #222 is documentation). Runtime proof also passes native mobile
scroll-position changes, desktop arrow scrolling, mobile→desktop→mobile observer
activation/cleanup and keyboard Preview navigation at both widths. Evidence:
/private/tmp/netflux-lane-runtime.cjs and netflux-lane-runtime.json. Production
build/typecheck, focused lint, nine ContentLane tests and eight desktop/mobile
Home/Browse navigation tests pass, with no retries. Component regression checks
prove mobile scroll/resize does not read geometry and breakpoint changes restore
and clean up measurements. Local platform telemetry/script warnings and existing
ServerResponse listener warnings do not establish candidate timing performance.

This proves removal of unnecessary mobile work, not an overall first-paint
speedup. Next: publish the focused change through required gates, verify deployed
mobile/desktop behavior, and retain the original objective as open until useful
user-visible readiness evidence supports closure. Do not repeat rejected font or
SDK packaging experiments or infer all pre-paint layout came from these hooks.


### 1 October 2026 — bounded Home/Browse acceptance assessment

Branch codex/home-browse-assessment in
/Users/j/.codex/worktrees/home-browse-assessment/Lifebook, based on d804d33f.
#223 merged with required checks passing; production deployment metadata resolves
to d804d33f. Production built-runtime smoke confirms mobile0/desktop22 lane resize
targets, mobile scrolling, desktop arrows, breakpoint transitions and keyboard
Preview navigation. This supersedes the pending #223 handoff.

Targets fixed before measurement: three cold browser contexts per page/profile;
visible-content readiness median≤2500ms, max≤4000ms; Home→Browse navigation to
visible heading median≤2000ms, max≤3000ms. Desktop1440x900 at1x CPU and mobile
390x844 at4x CPU, both150ms latency/200000bytes per second download. This is a
bounded working acceptance target, not a worldwide p75 or INP claim. Anonymous
returning-visitor profile dismisses onboarding; first-time onboarding and logged-in
journeys are not covered. Cold contexts do not imply cold CDN/image transforms.

Readiness requires first-contentful-paint, a viewport-visible h1 and first-screen
action through the ancestor opacity/visibility chain; Browse additionally requires
its high-priority focal image loaded. A further animation frame is awaited. It is
a painted-frame proxy, not proof of each pixel or an accessibility audit. Navigation
measures automation click through destination heading visibility and two frames,
after initial Home load; it does not measure clicking during hydration.

Harness corrections retained transparently: an initial launch stopped before any
samples because the functional smoke was still running; then an initial timing
pass was invalidated because DOM eligibility plus RAF could precede FCP. Its raw
observations remain in /private/tmp/netflux-home-browse-assessment/invalid-before-paint.log.
The corrected pass requires FCP, with unchanged thresholds. No favorable-result
reruns are authorized. Final evidence and verdict follow below.


Corrected production results (milliseconds; all 12 samples retained in
[evidence](evidence/home-browse-acceptance-20261001.json)):

| Profile/page | Readiness samples | Median | Maximum | Verdict |
|---|---|---:|---:|---|
| Mobile Home | 645, 631, 632 | 632 | 645 | Pass |
| Mobile Browse | 1463, 1574, 1554 | 1554 | 1574 | Pass |
| Desktop Home | 697, 700, 678 | 697 | 700 | Pass |
| Desktop Browse | 4660, 4678, 4693 | 4678 | 4693 | Fail |

Home→Browse navigation passes: mobile median1463/max1473ms; desktop
median1125/max1293ms. Every valid sample has zero failed critical assets.
The desktop failure is retained; no acceptance thresholds were changed.

One desktop diagnostic separates heading/action readiness (~1548ms) from the
hero image (~4834ms). Its 1024px optimized image transfers82236bytes and is already
requested early (~361ms) with high priority. Concurrent script/font downloads
finish around the same time. Image completion is the remaining readiness gate;
this does not establish image encoding alone as the cause of the entire delay.

An offline encoding preflight at width1024 and quality75 produced WebP81936bytes
and AVIF137531bytes (local encode103/350ms). Reject the same-quality format switch;
these quality numbers are not perceptually equivalent and no global conclusion
about AVIF follows. No configuration change was made.

A single extra diagnostic aborted256px card-image requests to probe contention,
but ResilientImage retries original sources on errors. Its ~4091ms hero result is
not a clean deferral comparison, not acceptance evidence, and not a candidate
speedup. Preserve that unsuccessful diagnostic without repeating the benchmark.
Raw script/output: /private/tmp/netflux-home-browse-assessment/
desktop-without-card-images.cjs and desktop-without-card-images-diagnostic.json.

Decision: Home/Browse is not fully accepted, and Preview→Reader optimization is
not started. Next implementation investigation should use a faithful development
candidate for offscreen card-image deferral (including horizontal lanes), retaining
first-screen images, fallback behavior, scrolling and accessibility. First inspect
which images are outside the viewport; do not suppress all cards or defer analytics.
Only a credible candidate warrants an affected-page comparison. If its benefit is
insufficient, report the remaining shared script/font cost rather than restarting
rejected packaging or font experiments. No application changes, paid AI requests,
production data writes, infrastructure purchases or timers in this assessment.
#28 remains open. Documentation-only handoff; no permanent/global speed guarantee.


#### Follow-up: offscreen card delivery preflight

Continued on 1 October, preserving the fixed failed desktop verdict. Production
inspection at1440x900 found all20 lane covers loaded: first row y698, second row
y1202, with four cards per row entirely to the right of the viewport. Native
loading=lazy uses a preload distance, not strict viewport intersection.

One additional diagnostic replaced all256px optimized cover responses with valid
one-pixel image responses inside the test browser. This avoids the failed abort
probe's direct-source retries; it intentionally also replaces visible covers, so
it is not a shippable candidate. Hero readiness was3917ms; heading/action1428ms.
Concurrent shared script downloads still finish around3.7–4.2seconds. Retained in
the existing evidence JSON. This single observation is not an acceptance pass, a
statistical speedup, or a strict causal upper bound: request interception and
run-to-run variance remain confounders.

Decision: do not add custom card intersection/loading machinery on this evidence.
Removing even visible cover payloads did not meet the2500ms median target in this
probe. JavaScript-gated loading could also delay visible images until hydration,
while conservative server-rendered image allowances limit possible byte savings.
No application changes were made; existing native lazy loading, image quality,
layout, analytics and fallback behavior remain intact.

Next action: inspect the shared initial JavaScript dependency graph for one safe,
optional import boundary that competes with the desktop hero. Do not repeat the
rejected analytics packaging/font experiments or disable short-visit analytics.
If no credible boundary is found within a bounded inspection, present the remaining
performance/design tradeoff before another comparison. Preview→Reader and #28
remain open. Investigation worktree codex/browse-card-delivery is clean atd804d33f;
results are carried in the existing codex/home-browse-assessment documentation PR.
No paid AI calls, data changes, application rollout or recurring timer was used.


#### Follow-up: bounded shared startup dependency inspection

Read the deployed chunk URLs from the pinned d804d33f diagnostic and inspected
public static JavaScript plus repository imports. Largest groups are React DOM,
Next.js runtime/navigation, Supabase client/authentication, PostHog and Sentry.
The largest mixed chunk includes a ~200.7KB raw/~63.3KB individually gzipped React
DOM module group and a ~61.7KB raw/~21.5KB Sentry group. Supabase group is ~55KB
gzipped; PostHog ~67.8KB. These recompressed module sizes are not additive to
transmitted chunks; minified signatures/registrations are not full source maps.
Sanitized chunk/module inspection retained in the existing evidence JSON.

AppOnboardingTour is already dynamically imported. The shared chunk containing
reading progress and snapshot hydration is ~10.1KB gzipped in total; extracting
its small verifier alone does not demonstrate a material opportunity. Immediate
authentication, short-visit analytics, error capture and navigation are active
requirements, not optional hidden widgets. No substantial safe optional import
boundary was demonstrated within this inspection. No application code changed,
no new build/benchmark/provider request was needed, and no speedup is claimed.

Decision checkpoint: stop small bundle experiments. The declared desktop Browse
readiness target remains failed; Home/mobile Browse/navigation remain accepted
only within their recorded local simulation. Next requires an explicit scope
choice: a larger loading-architecture investigation with clear authentication/
interaction safeguards, or accepting the residual desktop hero delay for now and
moving to Preview→Reader. Do not silently loosen the target or claim this delay
is fundamentally irreducible. This documentation follow-up remains in PR #224 on
codex/home-browse-assessment; the application worktree remains clean. #28 stays open.


### 1 October 2026 — Preview→Reader bounded readiness assessment

User accepted leaving the remaining desktop Browse hero delay open while moving
to Preview→Reader. PR #224 merged at85fc2cb7; application tree unchanged from
production d804d33f. Branch codex/preview-reader-readiness at85fc2cb7 in
/Users/j/.codex/worktrees/preview-reader-readiness/Lifebook. Read-only deployment
metadata at start identifies d804d33f. No code changes before measurement.

Frozen plan: /private/tmp/netflux-preview-reader/plan.json. Three fresh contexts
per page/profile on one public summary (The Singapore Story), 390x844/4x CPU and
1440x900/1x CPU,150ms network latency,200000B/s download,93750B/s upload. Readiness
requires FCP, visible title and loaded cover, plus a visible Read link on Preview
or visible Big Idea text on Reader, followed by an animation frame. Targets:
readiness median≤2500/max≤4000ms; post-load Preview→Reader navigation
median≤2000/max≤3000ms. First section expansion is additionally checked for
rendered text, with working median≤1000/max≤2000ms. No audio or AI calls.
Anonymous guest interactions may update isolated browser-local progress; no
account creation or authenticated writes. Results do not cover worldwide p75,
INP, first-time onboarding, all content types, or authenticated journeys.

Preflight proved canonical Reader link and section selectors before timing.
All samples, critical resource failures and errors are retained as they occur;
no favorable-result reruns. Raw harness/results live under the plan directory.
Assessment running; next: inspect complete fixed sample set, diagnose material
failures, and implement only a credible bounded correction with affected checks.


Production fixed-set results (milliseconds):

| Profile/page | Readiness samples | Median | Maximum |
|---|---|---:|---:|
| Mobile Preview |3031,3152,3015|3031|3152|
| Mobile Reader |2050,2909,3320|2909|3320|
| Desktop Preview |2930,3018,2913|2930|3018|
| Desktop Reader |3436,3617,3487|3487|3617|

All four readiness medians miss2500ms, all maxima stay below4000ms. Navigation
mobile2071,2089,1722ms (median2071); desktop2138,1893,2048ms (median2048) narrowly
miss2000ms medians, all below3000ms. Section expansion46–152ms passes; zero failed
critical assets or harness errors across the12 valid observations. No result is
relabeled as accepted. [Evidence](evidence/preview-reader-readiness-20261001.json).

One subsequent desktop diagnostic per route found cover requests begin atLow
priority then promote toHigh. Preview title1648ms/cover2520ms; Reader
title2724ms/cover3132ms. Covers are7930-byte224px responses, discovered at1428ms
and2498ms respectively; delivery priority is only one candidate and cannot fix
late discovery alone. Reader's ~78.5KB page-specific chunk includes Markdown
parsing/rendering; deferral could worsen the currently responsive section opening.

Candidate adds fetchPriority=high to both existing priority covers. No layout,
quality, dimensions, auth, analytics or fallback changes. Production build,
focused lint and21 existing component tests pass; local built Preview renders and
navigates without an error overlay. A small built baseline/candidate comparison
runs before deciding whether this change is credible. Baseline application tree
8f30ae8f matches d804d33f outside documentation. Both local environments lack
hosted Vercel telemetry endpoints (404); retain those failures as a limitation,
not production acceptance. Do not infer a speedup from priority alone.


Development comparison complete (one observation per page/profile/build):
mobile Preview3421→2975ms, mobile Reader3180→3062ms, desktop Preview3284→3010ms,
desktop Reader3270→3200ms. Navigation and section opening remain functional.
Candidate cover fetchpriority=high confirmed in built DOM, baseline unset. This
is enough to advance the tiny priority correction through required checks, not
statistical latency proof or target acceptance. All telemetry404 records retained.

Next: publish two application-line changes plus this evidence/checkpoint through
normal PR gates, verify hosted image request priority and affected journey, then
record production identity/limited verification. Targets remain unmet in the
production baseline; no broad refactor, model call or data migration is authorized
by this correction. No repeated full-site/capacity benchmark is needed.


#### Hosted candidate decision — priority-only change rejected

PR #225 candidate f2f3ed1a reached a ready hosted preview. Frozen12-observation
candidate run retained in evidence; Preview medians mobile2814/desktop2977ms,
Reader medians mobile3127/desktop3613ms. Outliers include mobile Preview4228ms
and desktop Reader6676ms. Desktop224px image requests startedHigh, confirming the
mechanism, but this does not establish an overall speedup or target acceptance.
Hosted preview CSP blocks feedback.js and PostHog config; one Reader interaction
check failed when scrollIntoViewIfNeeded encountered a detached node. These do
not prove a product regression: preview configuration differs from production,
there is no paired hosted baseline, and the patch changed only priority attrs.
No rerun was used to replace those observations. Security/CSP and DOM causes are
not claimed resolved by source inspection. Existing21 component tests and built
functional checks pass, but cannot override the failed acceptance evidence.

Auto-merge was disabled on discovery. Remove the two application lines and retain
PR #225 as documentation only; do not ship a speculative performance fix. Production
remains unchanged by this work. Candidate f2f3ed1a remains available in Git history;
there are no discarded samples, infrastructure changes or paid provider calls.

Conclusion: the representative journey is functional and section interaction is
fast, but readiness/nav median working targets remain missed. Image priority is
not a demonstrated solution, and late image discovery/shared delivery remain.
A larger rendering/streaming investigation would need its own hypothesis and a
matched hosted baseline before changing code. No further small priority, font,
analytics-packaging or favorable-result benchmark experiments are justified by
this run. Preserve the known limits rather than declare Preview/Reader complete.
Local servers/browser sessions stopped; no timers created. PR #224 merged;
#28 and residual Home/Browse desktop readiness remain open.


### 1 October 2026 — content arrival and CSS delivery control

Branch codex/content-delivery-control at85fc2cb7, worktree
/Users/j/.codex/worktrees/content-delivery-control/Lifebook. User authorized
continued investigation after Preview/Reader assessment. Production trace pinned
by read-only deployment metadata to85fc2cb7 (same application asd804d33f).
One desktop trace per route, same150ms/200000B/s network, captures streamed HTML
arrival through CDP, DOM readiness and document size. No paid/model calls or
account writes. Raw evidence: /private/tmp/netflux-content-arrival/.

Preview decoded HTML878564bytes, transmitted body67237bytes; Reader915427/
72961bytes. Both contain263725bytes of inline CSS. Largest inline framework
script564846/565575bytes includes two serialized copies of the stylesheet.
Title/cover markup received near2454ms Preview and2692ms Reader; DOM observations
follow at2467/2707ms. Cover complete2999/3707ms. CDP arrival times are observed
browser event times, not isolated server-processing durations; buffered streaming
bytes and event scheduling limit exact wire attribution. Network responseStart
is recorded separately. No unsupported pure-network/server inference.

Official local Next.js inlineCss guidance documents CSS duplication and the
absence of per-page configuration. A Tailwind source-scope preflight using only
app/components/hooks/lib reduced compiled CSS255722→254322bytes, gzip34592→34434
(<1%): rejected as a material optimization. An initial standalone preflight
module-resolution failure was fixed using package exports; no browser results
were discarded. Tailwind documentation: https://tailwindcss.com/docs/detecting-classes-in-source-files.

New diagnostic control changes only experimental.inlineCss true→false. This
revisits the earlier tradeoff because new traces show late content delivery.
It deliberately differs from the existing no-external-stylesheet release invariant
and is NOT approved for production by a diagnostic build. No checks/gates are
removed. Both builds use the same85fc2cb7 source/public configuration and fresh
production builds; baseline in clean codex/browse-card-delivery. Global utility
CSS hashes match exactly (258765bytes). Font CSS differs only in generated URL
form (absolute /_next/static/media vs relative ../media); verify resolved assets.
Built browser smoke renders Preview correctly in both; screenshots retained.

Fixed development plan: one cold-context observation per Home/Browse/Preview/
Reader, mobile390x844/4xCPU and desktop1440x900/1xCPU, same150ms/200000B/s network.
Inline/external order reversed by profile. Preserve all failures; local platform
telemetry404 is an environment limitation. No acceptance or statistical claim
from this small control. Next: inspect complete results; reject global external
CSS if it moves the delay back to Home/Browse. Do not publish the flag change
without resolving the prior release invariant and affected-page evidence.


Control complete: all16 observations retained, one per page/profile/variant.

| Page/profile | Inline CSS readiness ms | External CSS readiness ms |
|---|---:|---:|
| Home mobile |678|1550|
| Home desktop |625|1525|
| Browse mobile |1342|1823|
| Browse desktop |2614|2726|
| Preview mobile |3293|1412|
| Preview desktop |3277|1400|
| Reader mobile |3451|1478|
| Reader desktop |3282|1735|

These are development observations, not medians, production speedup proof or
acceptance. First paint also becomes later with external CSS even where useful
page content improves. All application styles match: global CSS byte hash is
identical; font CSS becomes identical after normalizing the generated relative
versus absolute asset paths. Local platform telemetry404 remains the only recorded
resource failure; no application asset failures or readiness errors.

The CSS control demonstrates a product tradeoff, not an unconditional fix. User
was asked whether to validate external CSS on matched hosted builds (recommended
before any rollout) or preserve current Home/Browse loading behavior. This scope
choice is pending because the prior agreed direction explicitly left Home/Browse
unchanged. Experimental global configuration has been restored; production and
release gates are unchanged. No hosted deployment/control rollout attempted.

PR #225 has merged at05e444a0. This worktree is fast-forwarded from85fc2cb7 onto
main afterward, preserving the intentionally uncommitted checkpoint/evidence.
The comparison builds remain pinned to85fc2cb7 and must not be relabeled as fresh
main evidence. If hosted validation is chosen, construct paired baseline/candidate
from the same fresh source/configuration; explicitly update the CSS release
contract for review rather than bypass the existing no-stylesheet gate. No need
to repeat source-scope or priority-only experiments. If preserving current loading
is chosen, hold the global candidate; retain the unresolved readiness limits.


#### Hosted validation authorized

User approved matched hosted validation of the CSS tradeoff. Production rollout
is not part of this comparison. Add a build-time NETFLUX_CSS_DELIVERY_EXPERIMENT
switch with default inline; external is rejected unless VERCEL_ENV=preview.
Both variants share one commit, project settings and preview environment. The
normal production no-external-CSS check remains unchanged. Experimental external
builds must instead prove local emitted stylesheet paths, non-empty app CSS,
absence of inline app styles and the same320KiB aggregate budget. No gate is
removed or skipped. Seven contract tests pass; typecheck and focused lint pass.
The existing external diagnostic build passes the new emitted-asset check plus
the sharp trace check. Initial test-type mismatch was corrected by documenting
the environment input type; no runtime acceptance data was discarded.

Next: open a held experimental PR, deploy inline and external previews from its
exact commit, freeze URLs/identities and a three-observation per page/profile
paired plan. Reverse order across repetitions/profiles; retain all failures and
report Home/Browse regressions alongside Preview/Reader gains. No paid AI calls,
accounts, production settings, database work, timers or production promotion.


#### Matched hosted result — 1 October 2026

PR #226 is held, auto-merge off, on `codex/content-delivery-control` in
`/Users/j/.codex/worktrees/content-delivery-control/Lifebook`. Both preview builds
are READY from the same measured commit `31a51e066fa80cba4ea3c05f5e209defbd7a2556`;
project, Node version and preview environment match. Their deployment IDs and
immutable URLs are in the evidence JSON. Production was not changed.

Completed the frozen 48-observation plan once: three fresh-context samples for
four pages, two viewport/CPU profiles and two CSS modes, alternating variant
order. Network simulation remains150ms latency/200KB/s down. Values below are
useful-content readiness medians, not first paint or real-user percentiles.

| Page | Mobile inline → external | Desktop inline → external |
| --- | ---: | ---: |
| Home |748 →2418ms|744 →2438ms|
| Browse |1702 →2230ms|4777 →4719ms|
| Preview |2730 →3387ms|2254 →3222ms|
| Reader |2260 →3949ms|3545 →3944ms|

**Reject the global external-CSS rollout.** Seven of eight medians became slower;
the58ms desktop Browse difference is too small to justify the regressions.
The local improvement did not reproduce on matched hosted builds. Smaller HTML
alone does not establish a faster experience: external stylesheet delivery moves
work onto the blocking path. Retain current inline CSS. The mobile Preview and
desktop Browse/Reader inline medians still exceed the2500ms target; desktop Browse
also exceeds the4000ms maximum. Do not call the overall bottleneck resolved.

All48 timed observations completed, without HTTP>=400 font/image/script/style
responses. This harness did not capture CSP/network requestfailed events, so this
is not a claim of zero browser errors. HTML end/size values recorded before stream
completion may be zero. Application CSS is identical after concatenating the two
external files and normalizing only generated font URL prefixes; initial per-file
hash comparison failed on the packaging difference and was corrected before timing.

Separate navigation/section smoke: initial hidden Read-link selector failed and
was preserved; corrected visible-link smoke passed mobile both variants and
desktop external with no horizontal overflow. Desktop inline stopped on a duplicate
h1 strict-selector error. Keep that baseline smoke limitation; do not repeat the
performance run or spend more validating a rejected candidate. Screenshots were
captured locally; no redesign, account writes, paid AI, database work or timers.

At measurement completion: PR scope, Security Validation, catalog evidence and
Vercel passed on31a51e06; validate was still pending. This appended evidence does
not validate a different application commit. Seven local contract tests, typecheck
and focused lint passed before deployment. One agent; no additional paid model
calls or benchmark repeats. Codex token usage unavailable.

Next: retain inline CSS and keep #226 unmerged. Decide whether to archive the
preview-only experiment as a documentation-only result, then resume narrowly
measuring font/image contention on the remaining slow pages. Do not ship the
global switch or repeat this comparison hoping for a favorable outcome. #28 remains
open. The hosted evidence and this checkpoint are the intentional follow-up changes.


#### Follow-up: font/image contention — 1 October 2026

User authorized continuing the focused investigation. Reused the immutable inline
preview at31a51e06 and existing network/desktop settings. Production remains
unchanged; #226 remains held with auto-merge off. Current worktree/branch unchanged.
No source implementation changed; only this checkpoint and existing evidence JSON.

Two attribution traces: Browse title/action appeared1575ms, fonts ready4364ms,
hero4898ms and useful readiness4915ms. Three fonts totaled119120bytes;17img-initiated
card transfers totaled142822bytes, alongside447142bytes of script responses. Hero
is preload/link initiated, so it is not included in that card-image subtotal.
Reader fonts were ready1705ms, title/action2327ms, cover2730ms, useful readiness2747ms.
This Reader sample points to late content arrival and subsequent cover completion,
not waiting for fonts. None of these figures establishes real-user averages.

One small paired diagnostic held only baseline below-viewport image requests until
hero readiness, then released them without abort/fallback. Reversed order across
two observations each: normal4784/4756ms, deferred4407/4399ms (medians4770/4403ms).
The367ms directional saving does not reach the4000ms maximum or2500ms median goal.
A separate one-observation font diagnostic held fonts until hero readiness:4219ms,
still above the maximum and initially using fallback typography. This is an upper-
bound-style diagnostic, not an equivalent-looking implementation or rollout proof.
No benchmark was repeated to replace failures; all observations are retained.

The diagnostic scripts inherit the old variant label `external`; the evidence
explicitly maps it to request deferral on the SAME INLINE preview, not external CSS.
Preview feedback and analytics-config CSP failures are recorded. Reader recorded
an aborted media request without playback. Public Browse was additionally opened
and inspected through agent-browser, then closed. No accounts, data mutations,
paid AI calls, infrastructure changes, timers or subagents.

Conclusion: do not add viewport gating or defer fonts as a claimed resolution on
this evidence. Both have modest potential but neither meets the stated target;
font delay changes the initial appearance. Keep the accepted production behavior.
Remaining work is reducing first-screen transfer competition/content-arrival delay
without losing analytics, changing typography or reducing image quality. The current
samples do not establish a safe implementation for that yet. Next investigation,
if continued: isolate initial script-transfer contention using a bounded diagnostic
before considering a specific module boundary; do not reopen CSS/priority experiments.
#28 stays open. These findings are appended to the existing held PR, not deployed.


#### Continuous follow-through and final disposition — 1 October 2026

User authorized necessary follow-ups without repeated proceed requests. Completed
one bounded script-contention diagnostic and one concrete Reader candidate; no
subagents, paid model calls, database work, accounts or recurring timers.

Holding all script requests until visual readiness reduced Browse medians from
4856ms to2390ms and Reader3607ms to2282ms (two each, reversed order). This establishes
substantial script competition in the simulation, not a shippable solution: it
delays hydration/interaction and short-visit analytics. Reused the previously
inspected shared dependency map rather than repeating its bundle audit.

Implemented one safe-to-evaluate boundary: extract the Markdown/highlight/sanitize
engine unchanged into a dynamic module used when a Reader section first opens.
Preserved visited text mounting, anchors, layout, fonts, auth and analytics. The
experimental code is retained locally at95c7fd1699dd3f774d946324e9c49a72d2122bb4 on
`codex/reader-markdown-loading` in
`/Users/j/.codex/worktrees/reader-markdown-loading/Lifebook`; it is NOT deployed.
19 focused tests, typecheck, lint, production build, CSS/sharp guards passed.
Initial dependency symlink build failure and asynchronous assertion updates are
recorded in evidence. No change to the sanitization or highlight algorithm.

Eight local paired observations (two per viewport/variant) showed:

| Metric | Original | Lazy Markdown |
| --- | ---: | ---: |
| Mobile useful-content median |3326ms|3211ms|
| Desktop useful-content median |3274ms|3277ms|
| Mobile first-section median |210ms|950ms|
| Desktop first-section median |75ms|904ms|

Initial compressed JavaScript fell by about117–118KB, but that did not establish
an appreciable first-screen improvement and moved waiting to section opening.
Reject this candidate; no hosted benchmark, PR or production rollout is justified.
Existing local baseline85fc2cb7 has identical app/components/lib/hooks/config/package
inputs to candidate base05e444a0 (documentation-only intervening commit).
Browser preflight passed visually; local telemetry404 retained. Detailed results,
including original failures/limits, are in the existing evidence JSON.

**Finish this bounded pass, without claiming the bottleneck resolved.** The tested
CSS/font/image/JavaScript tradeoffs do not support a further safe user-visible win
under the current constraints. Do not schedule another round automatically. A
larger shared-client/server-boundary redesign would be separate scoped work, not
an endless extension of these micro-optimizations. Real-user field evidence would
help determine whether that larger investment is justified; it has not been
collected here and worldwide performance remains unproven. #28 remains open.

PR #226 is now converted to a documentation-only record: remove the preview switch,
its test and all CSS-gate changes from the final diff; preserve experimental commit
history/evidence. It may merge through normal required gates without any application
behavior change. The current checkpoint/evidence are the only intended final files.
No need to repeat application performance measurements for this documentation change.

### Shared card visibility and Search loading — 1 October 2026

User authorized the focused follow-up after a Browse-to-sitewide audit. Branch
`codex/sitewide-search-load` in
`/Users/j/.codex/worktrees/sitewide-search-load/Lifebook` started from fetched
`origin/main` `3d237397`; application commit `801c4daf`. No redesign, database
write, paid AI call, account creation, new infrastructure or recurring monitor.

Live Browse and Search inspection found the first card in the DOM with its cover
fully loaded but CSS opacity zero until hydration. With JavaScript disabled, the
loaded cover stayed invisible. The shared `ContentCard` now paints the cover at
normal opacity from server HTML and still clears its backing placeholder after
load. This applies to Browse, Search and Library uses of that card; it does not
change the Browse hero or Reader/Preview cover components. Built local browser
checks confirmed loaded Browse and Search covers visible without JavaScript on
390px mobile, with no horizontal overflow.

Search previously awaited category statistics before starting any result query.
Unfiltered newest, text-search and popular reads now start alongside statistics;
category-filtered searches retain their statistics-derived raw category values.
Deferred-stat tests prove the first two reads start while the statistics RPC is
pending; the popular test covers Supabase's awaitable RPC builder. All 50 focused
SearchPage/ContentCard tests, typecheck, full lint, production build, Sharp trace
check and critical-CSS check passed. Built-browser newest, text, category and
popular pages returned 200 with 20 cards and no overflow. A representative
390px/1440px Home, Browse, Search, Preview and Reader smoke passed; one early
desktop Preview/Reader observation preceded streamed headings, which appeared
within the bounded follow-up wait.

Failed setup/correction evidence: `NODE_OPTIONS` preload was rejected by Next's
build worker; a temporary local environment-file link allowed the build and was
removed afterward. The first built Popular probe exposed `.catch()` on a
Supabase thenable; wrapping it as a real Promise fixed the route. Local text
search needed a disposable runtime cursor key because the developer environment
omits it. No production credential or configuration was changed. The local
Next server logged repeated listener warnings during multi-route smoke, with no
observed failed route after the correction.

This proves cover visibility and removal of a Search request dependency, not a
measured p95 or complete first-load win. Selected-category Search still waits for
statistics, authenticated Library was not browser-tested, and worldwide readiness
remains unmeasured. Next: inspect branch scope, push a ready PR, verify GitHub
file scope and `PR scope`, then enable squash auto-merge under the existing gates.

### Search catalog data cache — 3 October 2026

User authorized a Search-only, one-hour data cache for topic counts, first-page
Newest, and Popular, keyed on selected type and topic. Branch
`codex/search-result-cache` in
`/Users/j/.codex/worktrees/search-result-cache/Lifebook` started from freshly
fetched `origin/main` `1af81aed`; application commit `10a599cd`. No database migration, UI change, Browse page
change, image cache change, text-search cache, or deep-pagination cache.

The implementation uses Next's cross-request data cache with one Search tag and
3600-second revalidation. Successful empty results are cacheable; Supabase errors
throw inside the cached read so they cannot be stored. Existing UI fallbacks stay
outside the cache. Admin content invalidation of `/search` also expires the data
tag immediately; reader-driven Popular rank changes wait for the one-hour TTL.
Topic raw values are normalized before cache keying. Unfiltered reads still
start alongside topic statistics.

Focused tests (83 across six relevant files), typecheck, lint and policy checks
(rerun with locked dependencies),
production build, Sharp trace, and critical CSS check passed. A built local
server returned 20 covers for default Search, 19 for Business podcasts, and 20
for Popular books. Next cache debug logs showed first-read misses and repeated
hits for each Search key. Local request timings (single illustrative sample,
not p95): default 890ms then 43ms; Business podcast 225ms then 35ms;
Popular books 245ms then 36ms. Page two remained a live 225ms read. No account
write or production database mutation occurred.

Failed setup: first build used a symlinked `node_modules` outside Turbopack's
filesystem root and failed before compiling application code. A locked local
`npm ci` corrected the setup; the Next 16.3.6 build then passed. Temporary
environment-file links and local server were removed/stopped. No blocker or
pending product decision. PR #231 is open; its GitHub file list matched the
local scope, `PR scope` passed, and squash auto-merge is enabled. At handoff,
required `validate`, `Security Validation`, and `Catalog Search Evidence` were
running. Next: let required checks complete and address an actionable failure
if one occurs; no production database rollout is involved.
