# Frozen v1 provider-selection failure audit

Date: 19 September 2026. This is a read-only adjudication of the recorded results. No corpus labels, thresholds, production prompts, or provider outputs were changed. No additional provider requests were made for this audit.

**Decision: frozen v1 remains FAIL.** Required-evidence recall clears its approved thresholds, but irrelevant-evidence rejection does not. The failures include genuine wrong-entity selection, weakly related additions, and a mismatch between some fixture scopes/eligible lists and the actual Library surface. The latter does not explain away the former.

## Evidence and boundaries

- Frozen corpus: `corpus-v1.json`, SHA-256 `b177ec05c47fa623269b3d089656c0e86c57b71c2d4764b0333e0da2805bfcef`.
- Actual DB replay: `evidence/database-quality-v1.json`, SHA-256 at review `db51bf0123d5c22af7ac492a50b0d0d2bdd0d25215f75a49f2c43839b2a7e739`.
- Original provider checkpoint: `provider-selections-v1.json`, SHA-256 `606d3994a5d99f602863fe28418f403be96069b1486f6ce3c14c67257867fbd9`.
- Fixed selector: `personal-evidence-selector-v2`, Anthropic `claude-haiku-4-5-20251001`, 700 maximum output tokens, provider-default temperature, SDK retries disabled. All 168 model requests completed: 531,828 input tokens and 9,182 output tokens, 541,010 total. The two revoked-session cases in each run were denied before selection.
- The DB replay exercises recorded real Google vectors, ordinary authenticated production retrieval, actual lifecycle enforcement, production materialization/composition, and recorded real selector outputs bound to exact requests. It is not a live production exercise.
- Exact quotes below are deterministic stored-text comparisons. Free-form answers, their factual grounding and abstention, actual final-generation token counts, and answer adjudication have not been evaluated. A 4,000-byte evidence ceiling is not a measured token count.

## Exact denominators

The rejection implementation is a **case-level zero-extra-ID test**: a case passes only when every selected ID is in that case's frozen `eligibleIds`. It does not measure the percentage of answers that are factually correct. See `tests/database/personal-retrieval-quality-runtime.test.ts:394`.

| Measure | Recorded result | Denominator / interpretation |
| --- | --- | --- |
| Completed DB case-runs | 174/174 | 58 cases × 3 runs |
| Source recall | 54/54 = 100% | 12 source cases + 6 mixed cases per run |
| Highlight recall | 50/54 = 92.59% | 12 highlight cases + 6 mixed cases per run |
| Reflection recall | 54/54 = 100% | 12 reflection cases + 6 mixed cases per run |
| Equal-class recall macro | 97.53% | Mean of the three preceding rates; equal denominators also give 158/162 |
| Zero-extra-ID rejection | 118/174 = 67.82% | Required aggregate threshold 95%; run results 40/58, 39/58, 39/58 |
| Exact stored quotation fidelity | 36/36 = 100% | 12 exact-quote cases × 3 runs |
| Frozen exclusion-case empty output | 24/24 = 100% | 8 exclusion cases × 3 runs |
| Explicit forbidden target IDs excluded | 24/24 = 100% | Same exclusion cases; distinct from general semantic relevance |
| Revoked requests denied | 6/6 = 100% | 2 revoked-session cases × 3 runs |
| Required-empty cases with no selected evidence | 45/48 = 93.75% | 8 abstention + 8 exclusion cases × 3 runs; **selector proxy, not answer abstention** |

Across the 168 actual selection calls, 281 IDs were selected; 123 are outside their case's frozen eligible list. Those extras cause 56 failed case-runs: 24 source, 15 highlight, 14 reflection, and 3 abstention. There are no selections of any case's explicitly enumerated `distractorIds` (54 cases have such IDs, with 66 case/distractor pairs per run). That narrower success must not replace the approved zero-extra-ID metric.

Of the 123 extras, 29 refer to the same content item and repeat the intended idea in another evidence type. Another 91 are advice from adjacent topics, and 3 are the wrong witness. Exactly 10 failed case-runs contain **only** the same-content equivalents: learning, rest, and experiments source cases in all three runs, plus relationships source case in run 1. Hypothetically accepting only those 10 would give 128/174 = 73.56%, still far below 95%. This is a sensitivity calculation, not a revised score or release pass.

## Numbered examples and adjudication

1. **The same idea is relevant, but the fixture declares a scope that Library does not expose.** `source_segment-learning` asks “How do I test whether I actually remember something?” All three runs select the required editorial sentence, “Recall an explanation without looking before rereading it,” plus the owned highlight and reflection repeating that sentence. The case permits only the source ID and declares `scope: ["source_segment"]` (`corpus-v1.json:1273`). The DB driver correctly mirrors the live Library surface by retrieving all evidence types, because Library has no source-only filter (`tests/database/personal-retrieval-quality-runtime.test.ts:314`). The question itself does not ask for editorial-only evidence. These personal records are redundant but meaning-equivalent evidence, not a wrong fact. This is an evaluation-surface/scope mismatch. It is not proof that an actual requested product filter was bypassed. The same unambiguous pattern appears in source learning, rest, and experiments cases; the relationships case also has it, with additional adjacent-topic evidence in runs 2 and 3.

2. **A broad question admits plausible complements that the one-ID gold list does not discuss.** `highlight-planning` asks “What makes an intimidating project easier to begin?” (`corpus-v1.json:1633`). The required answer is choosing the next physical action. All runs also select “Try a reversible small version before making a lasting commitment” and “Attach a tiny repeatable action to an existing daily cue.” Both are plausible ways to make a project easier to start. They are not the same claim as the required passage, and the model should not stretch them into unsupported detail, but calling them definitively irrelevant requires a narrower predeclared rubric or question. Feedback/relationships and uncertainty/experiments have similar ambiguity. These need independent semantic adjudication; they are not automatically acceptable merely because the model chose them.

3. **Some additions are too weak to justify as direct support.** `reflection-boundaries` asks “How can I protect time without saying yes to everything?” (`corpus-v1.json:1993`). All runs retrieve the appropriate advice to decline commitments, plus attention, rest, and reversible experiments. Protecting an uninterrupted hour is a reasonable complement. “Try a reversible small version before making a lasting commitment” does not directly establish how to decline requests or protect already chosen priorities; selecting it requires adding an unstated connection. Similarly, all three `highlight-rest` runs add a consistent waking-time passage to a question specifically about exhaustion between hard tasks (`corpus-v1.json:1609`). These are substantive over-selection concerns under a direct-support rubric. Their seriousness should not be dismissed as a label bug.

4. **The witness failure is a real wrong-entity selection, with a separate lifecycle-label ambiguity.** All three `abstain-2` runs answer retrieval for “What did the withdrawn witness 2 say?” with highlight `69633225-261c-579d-989a-324416efe252`, titled “Forbidden witness 2,” containing “Captured passage: Forbidden evidence marker 2.” The intended unavailable source is a different record, `5bb85119-63af-5560-a398-d33291920e14`, titled “Withdrawn 2,” containing “Source observation: Withdrawn witness phrase 2” (`corpus-v1.json:993`, `:1097`, `:2279`). Similar names and the number 2 do not make the selected capture evidence of what the requested witness said. The actual withdrawn passage was not served. The selected capture is tagged `revoked` in the fixture, but the real DB model revokes a request session, not an individual owned capture. A new valid session on the same account can still access that capture, correctly (`tests/database/personal-retrieval-quality-runtime.test.ts:142`, `:304`). Thus this is neither an established authorization leak nor meaning-equivalent evidence. A static per-record `revoked` label is an inadequate description of the lifecycle scenario, while selecting the wrong surviving entity remains a genuine semantic error.

5. **All four recall misses expose “every stored instance” versus “sufficient comparison evidence.”** `mixed-risk` omits the highlight in all three runs; `mixed-habits` omits it in run 2 (`corpus-v1.json:2073`, `:2137`). Each still selects the current source and the user's reflection. Both questions ask to compare the user's interpretation with source advice. In these cases, the highlight has no attached note and repeats the same idea; the reflection supplies the personal side. The manifest nevertheless requires all three IDs. That is valid if the intended gate is exact retrieval of every requested instance, but the question does not request every instance, and the selector explicitly asks for the smallest sufficient set (`lib/server/personal-evidence-selector.ts:83`). A test of all three evidence classes should ask for all three, or the gold record should separately define acceptable supporting sets. These are still four frozen-v1 recall misses; this audit does not remove them. The long risk highlight also passes its separate exact-quote case, so the mixed-case omission alone does not show text truncation.

## Failure ledger

“Same” means additional evidence from the same content item repeating the target idea. “Adjacent” describes provenance in this ledger, not an approval of relevance. These are all the failed zero-extra-ID cases; unaffected cases are not listed.

| Case | Failed runs | Extra evidence |
| --- | --- | --- |
| source_segment-learning | 1, 2, 3 | Same highlight and reflection |
| source_segment-feedback | 1, 2, 3 | Same highlight; adjacent relationships source/highlight |
| source_segment-rest | 1, 2, 3 | Same highlight and reflection |
| source_segment-planning | 1, 2, 3 | Same highlight; adjacent experiments source/highlight |
| source_segment-uncertainty | 1, 2, 3 | Adjacent feedback/experiments sources; runs 1/3 also same highlight and adjacent highlights |
| source_segment-relationships | 1, 2, 3 | Same highlight; runs 2/3 also adjacent feedback source/highlight |
| source_segment-boundaries | 1, 2, 3 | Same reflection; adjacent attention source/reflection, rest source; rest reflection in run 1, experiments reflection in runs 2/3 |
| source_segment-experiments | 1, 2, 3 | Same highlight |
| highlight-feedback | 1, 2, 3 | Adjacent relationships and planning |
| highlight-rest | 1, 2, 3 | Adjacent sleep |
| highlight-planning | 1, 2, 3 | Adjacent experiments and habits |
| highlight-uncertainty | 1, 2, 3 | Adjacent experiments and feedback |
| highlight-boundaries | 1, 2, 3 | Adjacent rest and attention |
| reflection-feedback | 1, 2, 3 | Adjacent relationships; planning in runs 1/3, uncertainty in run 2 |
| reflection-planning | 1, 2, 3 | Adjacent experiments |
| reflection-uncertainty | 1, 2, 3 | Adjacent feedback and relationships |
| reflection-relationships | 2, 3 | Adjacent feedback |
| reflection-boundaries | 1, 2, 3 | Adjacent attention, rest, and experiments |
| abstain-2 | 1, 2, 3 | Wrong witness highlight |

## Proposed versioned benchmark repair

1. Preserve the v1 corpus, hash, model configuration, outputs, and failed gate. Do not change eligible IDs, thresholds, or prompt v2 in response to these held-out outcomes and call that the same evaluation.
2. Specify the actual product surface and expressible scope for every new case. Separate source-only component retrieval tests from all-evidence Library tests. If a source-only user scope is required, that needs an actual API/product contract; do not silently provide the model a fixture-class oracle. For existing all-evidence Library questions, classify all relevant owned evidence rather than assuming the hidden source class constrains an otherwise broad question.
3. Separate exact-instance recall from answer-support coverage. Ask explicitly for every capture when that is required. For comparisons, define required source/personal facets and independently approved alternative valid sets. A conflicting attached note must remain a required personal facet when its meaning differs from the source; an identical note-free highlight need not automatically be interchangeable with a current source.
4. Predeclare a relevance rubric distinguishing direct support, meaning-equivalent evidence, useful complementary evidence, tangential evidence, and forbidden evidence. Have independent reviewers label new cases before acquisition, with documented resolution of disagreements. Decide explicitly whether optional complementary evidence is permitted and how redundancy is measured. Retain strict wrong-entity and irrelevant-glossary tests. Do not replace the zero-extra metric with the easier named-distractor metric after seeing results.
5. Model lifecycle along separate axes: record ownership/deletion, source availability, and request-session validity. A revoked session must fail; another valid session should retain legitimately owned captures. If access to a particular record must be revoked, use an authorization state the product actually supports. Keep withdrawn-entity/name-collision questions as intentional semantic identity tests, with their expected surviving distractors clearly specified.
6. Treat v1 as a now-inspected regression set. Make any future selector change using separate neutral development examples, then freeze a fresh, independently labeled holdout and its thresholds before testing. Do not let a repaired gold list derived from current failures become the only release evidence. Run the final answer/token/adjudication gate only against exact production DB-composed evidence once the retrieval decision and evaluation semantics are resolved.

No release approval is implied by this repair proposal. The current approved threshold remains unmet, and the final-answer quality gate remains outstanding.
