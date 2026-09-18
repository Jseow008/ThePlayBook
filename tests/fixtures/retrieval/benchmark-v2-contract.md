# Personal retrieval v2: reviewed holdout contract

Date: 19 September 2026. Status: **frozen before provider acquisition**. This record defines evaluation inputs; it does not claim a passing result or authorize a production database change.

The v1 corpus, provider outputs, and failed result remain unchanged. V2 does not relabel those failures. Its subjects and evidence are new synthetic workshop/archive records. The purpose is to test the actual Notes and all-evidence Library surfaces against explicitly labeled support, including wrong entities, misleading word overlap, personal/source authorship, and absent evidence.

## Review and immutable identity

- Corpus file: `tests/fixtures/retrieval/corpus-v2.json`, version `personal-retrieval-v2`, draft revision 2, status `frozen`.
- **Final corpus SHA-256:** `dd866de9d24c712e929085f240ca5a47760cab74ef15f4a60d829bc937d58608`.
- Independently reviewed draft SHA-256: `cb3ef56995936efea313142d7926477a944d408739376501b6f3da084e6e0a6d`.
- Reviewer: parent-agent `/root`, review type `independent_ai`. The reviewer inspected the complete evidence pool, scopes/lifecycle, all twelve exact-quote targets, twelve title-free semantic questions, and comparison facets/alternatives before any v2 provider output existed. This is an AI review, not a claimed human review.
- The fixture author did not change production retrieval code or prompts for this work. The reviewer required clearer semantic questions, specific quotation targets, longer decisive passages, and correction of one fictional alphabetization error before approval. Those corrections preceded acquisition.
- Changes after the reviewed draft were metadata only: recording approval/freeze; clarifying that facet reports do not introduce a new numeric threshold; expressing existing deterministic requirements without new quality floors. No evidence, query, expected ID, or rationale changed after that review.
- The reviewed draft hash is intentionally not the final hash. The final hash is recorded outside the corpus to avoid a self-referential digest. Every vector bank, captured selector request, provider response, DB replay, and answer adjudication must bind to the final hash and its applicable model/request hashes.

The parent authorized freeze and subsequent acquisition under the existing delegated implementation authority. Further holdout changes require a new version and another pre-acquisition review. Once outputs are visible, use this version for evaluation/regression only, never prompt tuning. Separate development fixtures remain the place for implementation experiments.

## Actual request surfaces

Every case has an explicit `request` object. The adapter must use it and must never derive a request filter from `class`, `requiredIds`, `eligibleIds`, labels, or a model result.

| Field | Meaning |
| --- | --- |
| `surface: library` | Actual all-evidence Library path: editorial passages in the acting account's library plus that account's personal captures. Every such case has all three classes in descriptive `scope` and `notesScope: null`. There is no invented source-only API filter. |
| `surface: notes` | Actual Notes path with its explicit typed `notesScope` payload. Editorial source segments are unavailable through this surface. |
| `notesScope.itemType: highlight` | Selected text with no nonblank attached note, matching the current product's filter semantics. |
| `notesScope.itemType: note` | Highlight records with a nonblank attached note. A note is a field of this record, not a separate invented table/type. |
| `notesScope.itemType: reflection` | Personal reflections; the answer, not a matching prompt alone, must support the question. |
| `notesScope.itemType: all` | All personal highlights, notes, and reflections. |
| `accountId` | Fixture identity mapped to an ordinary authenticated account. It is never client authorization. |
| `sessionState` | Which actual request credential to use. A revoked session must fail before selection; the same account's newer valid session retains its owned records. |

The twelve source-class cases assess source guidance through Library. Their first four quotation questions identify the requested idea, not just a title shared by a glossary. The final four are title-free semantic requests that permit specifically labeled personal observations where those observations directly help. The required source ID remains justified by the request for source guidance; optional personal IDs never silently become mandatory recall targets.

The fixture includes 22 Library and 36 Notes cases. Its twelve title-free semantic questions are the Beech, Juniper, Sycamore, and Rowan cases in each of the three evidence classes. The Rowan personal cases refer to retained Umber captures and likewise omit their source title from the actual question.

## Independent axes for data and access

Evidence has separate `accountId` and `lifecycle: {record, source}` fields. Request-session validity exists only on the request. There is no per-record `revoked` state.

1. Seed every record, including later-deleted and other-account data, and build its actual index representation before applying lifecycle changes. A forbidden row must not be absent merely because its vector was never acquired.
2. Add each editorial source to its declared account's library. Public editorial availability does not make it a member of the other account's Library retrieval scope.
3. For `record: user_deleted`, delete the personal row using its owning ordinary account after indexing and verify that retrieval/index materialization no longer exposes it.
4. For `source: withdrawn`, soft-withdraw the corresponding source item. Every such content item has an explicit withdrawn source row in the manifest. Retained personal rows stay present and owned; their text remains eligible, with the source unavailable and no current editorial excerpt/link.
5. Establish an account-A session, revoke it, then sign in again on the same account. The two revoked-request cases use the old credential. Separate positive cases require the same underlying records under the new valid credential. Supabase sessions are distinct from account-owned rows; strict sign-out enforcement checks session existence, rather than assuming a still-unexpired JWT is unusable. [Supabase session documentation](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out).

The legacy `state` field is retained for compatible fixture seeding: `available`, `user_deleted`, or `withdrawn` for an editorial source. A retained personal capture can have `state: available` while `lifecycle.source: withdrawn`. The old diagnostic helper that simply filters every row by `state === available` is not an authorization or lifecycle oracle for v2; the real DB path is required.

## Direct-support rubric

The rubric is labeled before acquisition and applies to the actual question, scope, entity, and authorship:

- **Required direct support:** the record itself states an explicitly requested fact, event, instruction, or personal interpretation. Required IDs are not chosen because of shared titles or keywords.
- **Eligible equivalent:** an explicitly listed record states the same requested fact with the appropriate entity and authorship. Alternatives must be declared in advance; the evaluator cannot invent them after seeing a model choice.
- **Optional direct support:** the question explicitly permits a directly relevant personal observation, and the listed record supplies it. These IDs may be selected without counting as irrelevant; they do not increase the required-ID recall denominator.
- **Complementary/tangential evidence:** a related procedure needing an unstated inferential bridge is not eligible merely because it might be helpful in general. V2 questions name specific operations and observations so the distinction can be reviewed before results exist.
- **Irrelevant evidence:** glossary definitions without the requested procedure/value; a similar title; a different wing or room; a relevant reflection prompt with an unrelated answer; or an instruction embedded in a record that provides no requested fact.
- **Forbidden evidence:** excluded by the actual request scope, other-account ownership/library membership, personal deletion, editorial withdrawal, or invalid request session. Withdrawal alone does not forbid a separately retained owned capture.

The per-case `eligibleIds` list is the complete accepted set for the zero-extra-ID metric. Unlisted records are irrelevant to that specific question, or forbidden by the actual access/scope conditions. The independent review checked that default against the whole evidence pool. Labels/rationales are evaluator data and must never enter provider prompts or candidate construction.

## Comparisons, fields, and alternative sets

The six comparison cases ask for distinct source/personal facts. Three explicitly request all three evidence classes, so including a current source and reflection cannot silently stand in for the separately requested highlight/note. Cedar explicitly requires its conflicting attached note; Birch explicitly requires its reflection. Elm permits either of two personal records stating the same spacing adjustment.

- `requiredIds` contains fixed required evidence instances. Those determine class recall.
- Each `supportFacets` entry requires at least one selected member of its `anyOfIds`.
- `requiredFields` checks apply **only to selected members** of that facet. For an Elm alternative, choosing the note does not also require an unselected reflection's field. The selected note's actual `noteBody` must be present; an ID or highlighted passage alone is not proof that its personal interpretation survived composition.
- Each `acceptableEvidenceSets` entry is a minimal sufficient set. At least one must be a subset of selected IDs. Every selected ID must also be in `eligibleIds`; a supporting subset does not excuse unrelated extra records.
- Facet/set outcomes are supplemental diagnostics with per-case evidence, not a new numeric release threshold. Report failures beside the unchanged required-ID recall and rejection gates. They do not replace final answer grounding/adjudication.

The exact-quote target also names the stored field: `sourceText`, `highlightedText`, `noteBody`, or `reflectionText`. Fidelity compares the whole stored field after actual authorization. The model chooses an ID; it does not recreate quotation wording.

## Coverage, budgets, and denominators

| Coverage | Count per run |
| --- | ---: |
| Dedicated source cases | 12: 4 exact quotes, 4 specific editorial questions, 4 title-free semantic questions |
| Dedicated highlight/note cases | 12: 4 exact quotes, 4 specific personal questions, 4 title-free semantic questions |
| Dedicated reflection cases | 12: 4 exact quotes, 4 specific personal questions, 4 title-free semantic questions |
| Comparison cases | 6 |
| Abstention cases | 8, including identity collision, absent measurement, prompt-only match, wrong Notes type, glossary-only value, and embedded instructions |
| Exclusion cases | 8: 3 other-account/library records, 3 deleted personal records, 2 revoked requests |
| Total | 58 cases × 3 independent runs = 174 case-runs |

There are 88 explicit rows plus 1,001 newer noise highlights and 1,001 newer noise reflections: 2,090 rows before lifecycle operations. All required records share an older timestamp, so a first unfiltered page of each personal type contains noise. The actual `all`, no-note `highlight`, and `reflection` scopes exceed the configured 1,000-row Data API cap. The six note-bearing records do not independently exceed that cap; the generic age/first-page coverage tags refer to the unfiltered personal collection and must not be reported as proof of an over-cap note-only subset. Counts and ordering must be checked in the real database runner.

One exact-quote fixture per evidence class places its decisive text beyond character 500:

| Larch fixture | Decisive phrase start | Full quotation UTF-8 bytes |
| --- | ---: | ---: |
| Editorial source | 733 | 837 |
| Highlight | 654 | 758 |
| Reflection | 590 | 705 |

The prefixes before these phrases are ASCII, so those starts are also JavaScript UTF-16 offsets. Stored ink-sample text includes Unicode and an emoji. A local call to the actual `formatRankedPersonalEvidence` and `composeLibraryEvidence` helpers retained all three complete Larch texts, including the reflection prompt, in **2,938 UTF-8 bytes**. This is a capacity/format check, not a provider quality result or token count.

Final evidence remains at most 8 records, with the production 4,000-byte ceiling and the approved 4,000-token evidence ceiling checked separately using actual provider tokenization. Intermediate selection remains bounded at 96 candidates/256 KiB; this is not the final-answer budget. No lexical or gold-ID shortlist may be substituted for production semantic search.

Required-ID recall has **18 source, 16 highlight, and 16 reflection opportunities per run**: the twelve dedicated cases plus fixed targets in comparisons. Elm's alternative personal facet is reported separately, rather than requiring both interchangeable records or pretending both were retrieved. The macro retains equal weight for the three classes despite their different denominators.

The numeric floors are exactly the existing v1 values:

| Gate | Threshold |
| --- | ---: |
| Aggregate recall macro | 95% |
| Aggregate recall per class | 90% |
| Each run's recall macro | 90% |
| Each run's recall per class | 85% |
| Aggregate zero-extra-ID rejection | 95% |
| Aggregate correct abstention | 95% |
| Each run's rejection and abstention | 90% |
| Exact stored quotations | 100% |
| Forbidden-evidence exclusion | 100% |
| Independent model runs | 3 |

Rejection keeps the strict original definition: a completed case passes only if **all** selected IDs are eligible, over all 58 cases per run. It is not reduced to named-distractor avoidance. The 16 required-empty cases per run remain distinguishable as semantic abstention versus deterministic denial; selection emptiness is not a substitute for final-answer abstention. Record raw outcomes and denominators, including zero-result and denied requests, without dropping failed attempts from averages.

## Acquisition and release boundaries

The evaluator defaults to the preserved v1 version. V2 activation requires the final frozen hash above in its version registry. The draft-stage registry must refuse acquisition. The versioned adapter must use `request.surface`, exact `notesScope`, and `sessionState`; the existing v1 behavior stays unchanged.

Before acquisition, bind the embedding model/dimensions/task type, production selector prompt/configuration, generation model/caps/intent routing, corpus hash, and request hashes in the corresponding artifacts. Use actual production DB search and composition. Recorded synthetic vectors and responses may be replayed without new paid calls, but must remain bound to those exact inputs. Candidate capture is diagnostic, never a quality pass.

Keep all three raw selector runs and all applicable final-answer runs. Final answers must use the DB artifact's actual production `generationInput`, not the earlier rank-all diagnostic adapter. Record provider token counts and exact request/response hashes. Independent AI adjudication is permissible when its identity and rubric are recorded honestly; do not label it human review.

No quality result exists for v2 at this freeze. No production data, production prompts, or hosted settings were changed by the fixture author. The broader Phase 1 gates—citation resolution, guest migration, export/reconciliation, concurrent mutation behavior, and the ordinary-user journey—remain separate obligations. This retrieval holdout does not claim to establish them.
