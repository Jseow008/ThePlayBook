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
