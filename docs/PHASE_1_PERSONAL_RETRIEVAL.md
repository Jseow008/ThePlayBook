# Typed personal retrieval (#3, #4, #6)

Status: implementation checkpoint; **held, not ready to merge or deploy**.

## Current verification decision

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
`grounded-answer-development-review-v1.json`. A new final-answer execution is required
for the changed prompt; existing selector decisions and embeddings remain reusable.

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
