# Retrieval quality evidence

The current holdout is `corpus-v2.json`, frozen before acquisition at
`dd866de9d24c712e929085f240ca5a47760cab74ef15f4a60d829bc937d58608`.
Its scope, labels, review and unchanged release thresholds are in
`benchmark-v2-contract.md`. The original V1 corpus and failed provider/database
results remain intact. They are historical evidence, not a passing release gate.

## What each kind of evidence proves

- `baseline-v1.json` executed the old application routes with structural doubles.
  It establishes unsupported capabilities and clipping behavior, not a numerical
  semantic-quality baseline or real Auth/database proof.
- `provider-vectors-v2.json` contains real Google embeddings for every distinct
  synthetic field/query, including excluded records. Actual ownership, source
  withdrawal, deletion and session revocation are enforced later by the database.
- The database runner captures the exact production selector requests under real
  ordinary-account sessions. Gold IDs never restrict the candidate pool.
- Three independent selector calls per model-dependent case record raw output,
  usage, response identity and canonical request hashes. Replaying those outputs
  through the production database retrieval/composition path measures the frozen
  retrieval and deterministic quotation gates.
- Final-answer generation uses the exact database-composed prompt, model and
  output cap. Independent review assesses factual grounding, requested-facet
  coverage, abstention and personal/source attribution. Selector scores alone
  do not establish these answer properties.
- The real browser journey and worker/lifecycle suites are separate evidence.
  Neither a unit-test total nor the benchmark replaces the production release gate.

## Reproducible stages

`scripts/evaluate-personal-retrieval.ts` defaults to a no-network plan. Use
`NODE_OPTIONS=--conditions=react-server npx tsx scripts/evaluate-personal-retrieval.ts --corpus=v2`.
The default corpus remains V1 for historical tooling; explicitly choose V2.

1. Acquire vectors with `--corpus=v2 --execute --vectors-only --output=<new path>`.
   `--env-file=<local file>` is optional; only the required provider key is read.
   On a failed acquisition, preserve that artifact. An explicitly chosen
   `--resume-acquisition-from=<old path>` reuses confirmed vectors and counters;
   uncertain requests are not treated as successes. Never overwrite earlier evidence.
2. Run `tests/database/personal-retrieval-quality-runtime.test.ts` against disposable
   loopback Supabase with `PERSONAL_RETRIEVAL_CORPUS_VERSION=v2` and
   `CAPTURE_PERSONAL_SELECTION_INPUTS=1`. Use the DB107 credentials supplied by the
   existing disposable-database setup. This captures candidates and is never a
   quality pass. Fixture files and output paths have explicit environment overrides.
3. Validate the capture with `--corpus=v2 --selector-inputs=<capture path>`.
   Add `--execute --output=<new path>` only for the actual selector batch.
   `--vectors-from=<fixture path>` selects the verified vector bank. The capture,
   evaluator and production selector share canonical request/model hashing and
   refuse drift in prompts, field values, identities, budgets or configuration.
4. Run the database test with capture mode unset and the recorded selector fixture.
   Every case runs three times. Missing/error cases remain in denominators.
   The report includes exact prompts for downstream generation, bound to current
   production-module and per-record hashes.
5. Use `--corpus=v2 --database-results=<replay report>` for a no-network answer plan.
   Add `--execute --output=<new path>` for final generation. This path refuses
   candidate-only captures, incomplete replay or changed production modules.
   V2 cannot use the old full-scope ranker diagnostic instead of the database path.
6. Assess answers independently, then use `--corpus=v2 --score=<generation report>
   --reviews=<review file>`. Each production-capture review includes `caseId`,
   `run`, `reviewer`, `reviewerKind` (`human` or `ai`), `independent: true`,
   `rubricSha256` (the frozen corpus hash), `responseSha256`, `grounded`,
   `answerComplete`, `abstained`, and `noteAttributionCorrect` where applicable.
   AI review is reported as AI, never human. The answer generator must not silently
   grade itself; unknown/unreviewed answers cannot acquire a quality pass.

## Budgets and provenance

The frozen corpus has 58 cases and 2,090 expanded records, with 1,001 synthetic
noise captures per personal class. V2 has 145 distinct embedding inputs. Notes
uses its actual declarative filter; Library uses its actual all-evidence surface.
Request session validity is separate from a record's lifecycle. A retained owned
capture can remain available after its source is withdrawn, while the editorial
excerpt cannot be served.

Google embeddings use `gemini-embedding-001`, 768 dimensions and provider-default
task type. Acquisition uses serial batches, bounded explicit 429 backoff and no
SDK retries. The artifact records all attempts, confirmed vectors and incomplete
outcomes. Raw acquisition JSON is preserved losslessly in the compressed evidence
files; their compressed/original hashes are recorded in the provenance manifest.

The selector's current model/configuration comes from the production helper:
Haiku 4.5, prompt V3, at most 96 intermediate candidates, 256 KiB complete candidate
blocks, a 20-second deadline and 700 output tokens. Its evaluation is capped at
200 attempts and two million measured input tokens. Actual three-run calls are
never copied to simulate independent runs. Provider failures stop and checkpoint
the batch, rather than becoming successful abstentions.

Final context is at most eight items and conservatively 4,000 UTF-8 bytes. The
benchmark separately measures the approved 4,000-token budget using Anthropic's
model-specific `count_tokens` endpoint, including message overhead. Identical
model/system/message counts are cached only within that execution, with exact
hash and cache-hit provenance; generation responses are never reused across runs.
Generation usage and token-count estimates are recorded separately. Notes uses
Haiku for simple questions and the existing complex model (Sonnet 4.6 by default)
for synthesis; Library uses its production intent/model mapping. No unverified
price estimate is supplied.

The earlier full-scope rank-all diagnostic is retained only to reproduce the
recorded development failure. It does not invoke the production retrieval RPCs,
prove real authorization, or satisfy the current release gate. Historical V1
outputs remain bound to their original prompt/model; they cannot be replayed as
if produced by a changed selector.
