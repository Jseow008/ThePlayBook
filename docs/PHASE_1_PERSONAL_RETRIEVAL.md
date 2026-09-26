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
