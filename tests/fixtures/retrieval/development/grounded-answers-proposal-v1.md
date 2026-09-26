# Grounded answers development proposal v1

Status: frozen for development acquisition after independent AI pre-acquisition review by `/root`. No provider outputs were available at freeze. All six cases and the appendix were approved; the only review adjustment makes supported excess detail a descriptive focus diagnostic. This is development evidence, not a new holdout or a replacement release gate.

The candidate adds one general instruction to answer generation:

> Answer only the requested facets. For precise factual details such as physical position, direction, sequence, quantities, or identity, prefer the evidence's short decisive wording; preserve its relationships, units, negation, and qualifiers. Paraphrase surrounding explanation naturally, but omit unrequested recaps, advice, and plans.

This favors faithful short phrasing when paraphrase can lose a decisive relationship. It does not require every answer to be a quotation, impose a template, prohibit useful comparisons, or substitute deterministic answers for generation. Existing authorship, current-evidence, and abstention rules remain in effect. Model selection, output limits, retrieval, selection, and UI behavior remain unchanged.

The six synthetic cases in `grounded-answers-v1.json` cover three paired concerns:

| Concern | Factual recall | Comparison |
| --- | --- | --- |
| Physical relationships | Foam wedge between a frame and wall | Source and personal felt-strip placement differ in side, inside/outside, and height |
| Immediate sequence | Ink rolling immediately precedes placing paper | Source tare-recording order differs from a personal report |
| Quantity and identity | Courier and installer share a name but handle different counts | Highlight and reflection allocate different solo-bar counts to the bassist |

Each case fixes requested propositions, decisive evidence wording, prohibited factual substitutions, and examples of unrequested details before model calls. These labels belong only to evaluation. They must never be included in either model condition. The evidence uses the real `sourceText`, `highlightedText`, `noteBody`, `prompt`, and `reflectionText` fields. Titles are ordinary source titles and do not encode relevance judgments.

Use the production formatter and `buildPersonalEvidencePrompt` or `buildLibraryEvidencePrompt` to construct each answer request. Treat the supplied records as authorized and already selected; this isolates generation and does not measure embeddings, selection, ownership, live sessions, or database coverage. If the harness cannot use a production formatter without a fixture adapter, record the adapter and resulting context verbatim so that its boundary is visible. Do not silently invent a different evidence labeling scheme.

The baseline uses the unchanged production answer prompt. The candidate appends only the proposed paragraph to that prompt for this development experiment. It does not edit production code. Use the actual `retrieval-generation.ts` intent/model/cap helpers and assert the fixture's expected configuration: three factual Notes cases on Haiku 4.5 at 350 output tokens, two Library comparisons on Sonnet 4.6 at 500, and one Notes comparison on Sonnet 4.6 at 450. A configuration disagreement must be resolved before calls, not hidden by overriding the helpers.

The proposed acquisition is one baseline answer and three independent candidate answers per case: at most 24 generation requests, after parent approval. Do not call an embedding service, selector, or database. Use bounded serial scheduling and zero SDK retries; stop and report quota or provider failures. Record actual model IDs, prompt/context hashes, configuration, usage, raw answers, and failures. Preserve every output. Record any token-counting calls separately.

The pass requirements are requested fact coverage, grounding including quotation fidelity, attribution, and no unsupported abstention. Faithful paraphrases can pass: the phrase examples are evidence anchors, not exact-match answer keys. Quoted language must match its referenced field. Record supported extra facts or recaps separately as descriptive focus diagnostics; they do not fail an otherwise grounded, complete answer. Unsupported additions still fail grounding. Brief source labels and necessary qualifications are allowed. Direct arithmetic is permitted where explicitly stated for the allocation comparison. Record independent reviewer identity and specific answer spans for failures.

The development decision should consider every case and every raw answer. A candidate should improve factual precision or requested-facet discipline without losing required facts, useful attribution, or supported comparisons. These six cases cannot establish broad model quality. Keep the production change unmade until the parent reviews the development outputs; any later release evaluation remains separately versioned, with unchanged thresholds and no relabeling of prior failures.

No held-out corpus or held-out model review was read for this task. The author has worked on earlier retrieval fixtures in the wider project; this document does not claim the author has never seen those materials. These examples were newly drafted from the requested general concerns and current production field/prompt interfaces, before their own acquisition.

Freeze record: reviewer `/root`, independent AI, before acquisition. Reviewed draft SHA-256: `e59e41f47c1a43e600fb2c83a15be4406c7c772e806947f60e454d7d0cabbb84`. Final fixture SHA-256: `75c06170d8679eb0da951a9cafc5ec62f974dcc60702e41db957a6d7f60db55c`. The six-case JSON hash remains `e595d4747385ec034e3f91b0e208eb143b6be57f43d7f6f5413aa840bd873515`; the appendix hash remains `c3b0de5709426079d8b922b7c209f56f91cb8a37ce3dd3bf4ae74ff5fe74bb90`. Only criteria/status/review metadata changed after the approved draft.
