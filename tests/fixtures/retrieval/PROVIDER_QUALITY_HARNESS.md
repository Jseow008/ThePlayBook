# Frozen-corpus provider evaluation

The runner is `scripts/evaluate-personal-retrieval.ts`. Its default mode is an offline plan: it does not read keys or contact a provider. The corpus SHA256 is fixed in code; the 58 cases, expected IDs, and approved thresholds are not edited or used to tune the similarity threshold.

The current quality path uses **captured production database selector requests**, described below. The earlier full-scope ranker/fixture-cosine path remains a diagnostic only; it is not the persistent-index production retrieval path. Neither a selector-only result nor that older diagnostic establishes the complete release gate.

## Production selector capture and replay

The ordinary-account database runner writes `artifacts/personal-selection-inputs.json`. It seeds the complete synthetic corpus, uses the actual personal/source retrieval functions, and captures the exact production selector payload. The artifact separately lists requests rejected for actual session revocation and scopes that deterministically have no candidates. No expected IDs are provided to the selector. A capture is never a quality pass.

Use `--selector-inputs=artifacts/personal-selection-inputs.json` for an offline plan, or add `--execute --output=/absolute/new-selections.json` for the authorized provider run. A verified existing vector sidecar is required (`--vectors-from` defaults to the checked-in provider vector fixture); no new embedding requests occur in this mode. Only the Anthropic key is needed. The v2 frozen capture has 56 requests plus two revoked-session cases, so there are 168 distinct model requests across three runs.

Capture, provider evaluation, and database replay share `canonicalPersonalEvidenceSelectionRequest`, `personalEvidenceSelectionRequestHash`, and `PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG` from the production selector module. The hash covers the exact system/prompt strings, prompt version, permitted output IDs/count, output cap, and fixed provider/model configuration. The evaluator rebuilds the canonical request using the production helper and refuses drift. It also checks every candidate field/span, title, identity and question against the synthetic fixture before any provider call; an arbitrary private payload cannot be introduced by simply regenerating a hash.

The current selector uses prompt version `personal-evidence-selector-v2`, at most 96 intermediate candidates, a 256 KiB whole-block byte bound, at most eight selected IDs (one for an exact quote), a 20-second deadline, and 700 output tokens. The producer's semantic candidate allocation is 32 per class. The intermediate budget is distinct from the final eight-evidence / conservative 4,000-byte context budget. The v2 prompt distinguishes a copied highlight from a current editorial passage when comparing the author's advice with the user's interpretation; this correction came from a separate development probe.

The provider mode makes at most 200 selection attempts, paces calls by two seconds, disables SDK retries, and observes an aggregate two-million-input-token stopping limit. Only explicit 429 responses receive the bounded scheduler retry policy. It saves a checkpoint after each case with all three runs' raw structured response text, selected IDs, actual input/output usage, response/model identity, and request hashes. A provider failure is recorded and stops the run; it is not successful abstention. No prompt or model configuration may change mid-run.

The result has version `personal-retrieval-provider-selections-v1` and is consumed by the database runner. Replay checks the exact current production input/model/vector hashes before supplying each recorded selection to the production validation, materialization, quote and composition path. The separate selection-only metrics in the provider artifact describe IDs before final context composition. They are **not** exact-quote fidelity, answer faithfulness, or a full release pass; the real database replay supplies the frozen final retrieval/quote metrics, and answer generation/human adjudication remain their own evidence.

## Earlier vector and ranker diagnostic modes

Without `--selector-inputs`, the older ranker diagnostic uses full-scope personal ranking and exact fixture-vector cosine for source preselection. It calls production span, formatting, composition and prompt helpers, but neither production retrieval RPC. It does not authenticate ordinary users, recheck live changes, resolve citations, exercise HTTP intent routing, or measure production latency. Its source/personal preselection scores must not be substituted for the production capture/replay results.

## Running

Use `NODE_OPTIONS=--conditions=react-server npx tsx scripts/evaluate-personal-retrieval.ts` for the no-network plan. It records 58 cases, 174 planned result records, 18 expected retrieval opportunities per class per run, 2,090 expanded records, and 131 distinct synthetic embedding inputs.

Provider execution is explicit. `--execute --vectors-only --output=/absolute/new-run.json` acquires only the vector bank and writes a `.vectors.json` sidecar. `--execute --vectors-only --resume-acquisition-from=/absolute/earlier-run.json --output=/absolute/new-run.json` preserves successful vectors and prior request/input counters from an interrupted acquisition and acquires only the missing inputs. A new output path is mandatory; earlier evidence is never overwritten.

For a subsequent model evaluation, pass `--execute --vectors-from=/absolute/new-run.json.vectors.json --output=/absolute/new-quality-run.json`. Reused vectors are checked against the corpus hash, exact input set, model, dimensionality, encoding, and finite nonzero values. The artifact records the imported file's SHA256. This validates file integrity against the protocol, not provider origin by itself; retain the acquisition artifact as provenance. Without `--vectors-from`, full execution acquires the vectors first.

Keys are read only for explicit execution, from the current process or a locally parsed `.env.local` in the original repository. An explicit `--env-file=/absolute/path` is supported. Only the required Gemini/Anthropic key is used for the selected mode. No keys, headers, environment contents, or raw error messages are written to artifacts. CI does not need these secrets to consume the vector sidecar.

## Provider requests and budget

- Gemini uses `gemini-embedding-001`, 768 dimensions, provider-default task type, fixed threshold 0.55. The runner acquires one vector per distinct exact input text; identical synthetic noise inputs share a vector. It does not make a lexical shortlist or seed vectors from expected IDs.
- All synthetic fixture records, including forbidden records, have vectors. Their ownership/state is enforced by the adapter's fixture metadata; a real database runner must establish and test the corresponding live authorization and lifecycle state.
- The provider scheduler issues serial batches of at most 10 texts, with at least two seconds between requests. Google SDK internal retries are disabled. Explicit HTTP 429 responses get at most two retries after the indicated delay; delays over 60 seconds stop the run. Uncertain network failures are not retried automatically. A failed provider request stops the run and preserves a checkpoint; it is not recorded as successful abstention.
- Hard work limits are 650 provider attempts, 2,048 embedding inputs / 2 MB input bytes including retries, 200 generation attempts, and a conservative 1.8 million reserved generation-token units. Each full prompt must first count at most 8,000 input tokens. Output caps are the production 350/450 Notes and 450/500 Library limits. These are work bounds, not a dollar estimate or an account billing ceiling.
- Anthropic model IDs are fixed to the current production defaults in the protocol: `claude-haiku-4-5-20251001` for Notes and `claude-sonnet-4-6` for Library. Environment model overrides do not change the evaluation. Model configuration, helper/route hashes, input prompts, selected spans, and complete raw response text are saved for each case/run.
- Embeddings are acquired once and reused unchanged. Model-dependent responses receive three separate generation calls; the runner never copies one response into three runs. Exact quotations and successful empty-evidence paths repeat the deterministic branch and are explicitly marked `modelCalled: false`.

The runner uses Anthropic's actual model-specific `count_tokens` endpoint for an evidence-only message and the full generation prompt. The evidence count includes message overhead and is conservatively compared with the 4,000-token contract; the 4,000-byte implementation ceiling is recorded separately. Generation usage records actual input/output token counts returned by the provider. The count endpoint is an estimate and can differ from generation usage. [Anthropic token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)

The vector sidecar contains base64-encoded IEEE-754 Float32 little-endian vectors, keyed by SHA256 of the exact UTF-8 text. Each synthetic record includes its fixture identity, state, source identity, and typed field/chunk index/UTF-16 offsets. Query vectors are mapped to all 58 case IDs. The database runner must map synthetic/noise IDs to valid UUIDs, seed actual accounts and current memberships, create the indexed revisions, and call production RPCs. Source evidence IDs map to `segmentId`; evaluation expected IDs use the fixture row's `id`, both of which are retained. Expected IDs must never determine which candidates are seeded.

## Scoring and manual review

The three-run report uses the frozen numeric thresholds. Missing or errored records remain in denominators and cannot pass.

| Metric | Denominator and rule |
| --- | --- |
| Recall by class | 18 cases per class per run: 12 single-class cases plus six mixed cases. Equal case weight within class; mixed cases contribute their own required item to each class. Macro-average the three classes, then check aggregate and per-run limits. |
| Irrelevant rejection | All 58 cases per run. Every selected ID must appear in that case's frozen `eligibleIds`; an empty eligible set requires no selected IDs. Named distractors are not the only disallowed results. |
| Abstention | All 16 cases with `abstentionRequired` per run, including exclusion cases. A successful deterministic no-evidence branch qualifies. Otherwise a human review bound to the exact response is required; unknown/model-judged abstention is not granted a pass. |
| Exact quotation | All 12 exact-quote cases per run. Output must be the stored text byte-for-byte from the deterministic branch. |
| Forbidden exclusion | All 58 cases per run. Selected IDs must be in scope/available/owned; forbidden full-text witnesses may not appear in prompt context or output. This is fixture-only exclusion, not a database or citation authorization proof. |

Every model response requires human assessment of groundedness and abstention. Cases with required attached notes additionally record whether the full note reached the prompt and require review of attribution; recovering the highlight ID alone does not prove the conflicting user interpretation was used. The fixture has one explicit disagreement example and several other attached-note examples. A deterministic exact-highlight request does not require the attached note to be quoted.

Supply an array of reviews using `--score=/absolute/quality-run.json --reviews=/absolute/reviews.json`. This mode has no provider requests. Each review contains `caseId`, `run`, a nonempty `reviewer`, `responseSha256` of the exact response text, boolean `grounded`, boolean `abstained`, and `noteAttributionCorrect` (boolean where needed, otherwise null). A changed output invalidates its old review. No heuristic or second model silently substitutes for this review.

Numerical metrics may be shown before review; the provider diagnostic verdict stays `INCOMPLETE` until records, measured token evidence, actual generation usage, and human review are present. Even `THRESHOLDS_MET_IN_DIAGNOSTIC_ONLY` does not establish the production database gate or broader Phase 1 release gate. The old structural baseline is not a semantic before/after comparison.

## Coverage limits of the frozen corpus

The corpus can measure its labeled retrieval tasks and expose deterministic wrong quotes, omissions, distractors, and forbidden witnesses. It is insufficient by itself to establish broad semantic quality: most topics repeat a short pattern across the three evidence classes, the 2,002 noise captures reuse one sentence, and the manifest has no detailed answer-faithfulness rubric. State labels are static; they do not simulate a real mid-request edit/revocation or database cap. It also lacks the authenticated journey and citation-resolution coverage. These limits must remain visible in the result, rather than being repaired by tuning the frozen labels or threshold.
