# Saved quotation and marked-passage mismatch

**Finding:** this is a content-revision anchoring defect. The saved quotation and location were valid against the historical section. The same section record now contains a different chapter. When the quotation is absent, the renderer falls back to those stale positions and emphasizes unrelated words. Confidence is high for this record and mechanism. No implementation or data repair has been made.

## Scope and checkpoint

This investigation is separate from completed PR #276, draft protection and optional retrieval/editor UX. Worktree `/tmp/netflux-highlight-quotation-investigation`, branch `codex/highlight-quotation-investigation`, freshly fetched base/source `b10fb615c0f2e571e8fcc506fb9bb3e99420fd2b`. Report/evidence only; no application changes, production writes, migration, deployment, paid project or new PR. The previous worktree and primary Lifebook checkout were left unchanged after removing the temporary diagnostic test.

[Sanitized evidence](evidence/highlight-quotation-investigation-2026-10-23.json) contains scenario observations and source hashes. Scoped source fixtures and diagnostic harness are retained privately at `/tmp/netflux-quote-investigation`; directory 0700 and input/harness files 0600. No account identifiers, credentials or attached note bodies were collected in the report. Existing backup files were read only, never restored or modified.

## Stored record, source and revisions

| Evidence | Historical source | Current source |
| --- | --- | --- |
| Saved quote/location | `concentration`, `[672,685)` | Quote and positions remain unchanged since 20 April 2026 |
| Section identity | Same section ID, position 6: **The Communist Failure and Neo-Proprietarianism** | Same ID and position 6: **The Social-Democratic Compromise of the Twentieth Century** |
| Source dates (UTC) | Section version last updated 11 April 2026; identical body in 15/17/25 July backups | Current section last updated 7 August 2026 |
| Exact quotation occurrences in saved section | Exactly 1, at 672 | **0**, including a case-insensitive check |
| Words at stored position in renderer’s text | `concentration` | **` retained hig`** |
| Exact quotation elsewhere in current book | Not needed to identify old passage | Four, one each in sections 3, 8, 9, 11; they provide no unique reassignment |

The historical context describes wealth concentration shielded in international tax havens. That surrounding phrase does not occur in the current book. Current matches refer to different contexts: the proprietarian order, social nativism, corporate power and inheritance. Finding the same word elsewhere cannot establish the original passage.

Three backups preserve **one** historical version, not three different revisions. Their identical source hash is `3bd4a52cd94a770fddf57d8487a9d8649953fccd796589a9cfa1025e9189e8ec`. The current body hash is `ff1a80b2c064b3f1023fbee14242c4305fd2a68e6b9af42f29ff15e1855c3fb6`. Complete edit history, who/why the section was repurposed and any intermediate versions are unproven. The latest update timestamp alone does not establish exactly one content edit.

Highlight storage contains quote, offsets and section/content IDs, but no source revision, prefix or suffix that could disambiguate a changed passage. The saved record itself was valid against the archived content; this is not evidence of an originally incorrect selection.

## Reproduction and observed behavior

Real-record reproduction: in the owner’s Notes, filter Notes and sort Oldest first; open the April 20 Capital and Ideology entry. The stored quote is `concentration`, but its current mark contains ` retained hig`. Opening the correct ID/thought does not establish that the highlighted words are correct. Expected: confidently identify the original quoted passage, or explain that it cannot be located. Actual: unrelated words receive a normal mark and spotlight, with no unmatched explanation. Impact: a saved thought is presented against the wrong context. Confidence: high, supported by read-only live values, archived source and actual renderer replay; earlier public DOM observation agrees.

Controlled examples used the real SegmentAccordion/ReactMarkdown/remark/rehype pipeline in Vitest/JSDOM. Settings and media queries were mocked; matching/rendering functions were not replaced. Six synthetic cases plus historical/current source replay were observed:

| Controlled input | Expected safe behavior | Actual renderer output | Assessment |
| --- | --- | --- | --- |
| Unchanged `concentration improves.`, stored `[0,13)` | Mark saved quote | Marks `concentration` | Positive control |
| Add `Intro ` before a unique quotation | Recover a uniquely identifiable exact occurrence | Marks `concentration` at 6 | Positive control; does not prove every revision is unambiguous |
| Revise text to `collaboration improves.`, keep quote/positions | No unrelated emphasis; unresolved destination | Marks **`collaboration`** at 0 | Reproduces false-mark defect without production data |
| Original `Heading: concentration.`, old start 9; revised `concentration and concentration.` | Two equally plausible matches must remain unresolved without more evidence | Matches at 0/18; silently marks first at 0 | Ambiguity defect; confidence high for this case |
| Same repeated text, positions absent | Do not invent a single original occurrence | Emits same highlight ID for **both** occurrences | Ambiguous legacy behavior; confidence high for this case |
| Missing quote, old range beyond short source | No mark | Emits no mark | Renderer-only observation; full-reader explanation not exercised here |
| Historical July source with actual saved record | Mark original quote | Marks `concentration` at 672 | Confirms originally valid selection |
| Current August source with same saved record | Explain original passage cannot be located | Marks **` retained hig`** | Reproduces observed public failure |

One temporary diagnostic test asserted all eight observations. It ran twice: the second run added DOM start-offset observations to distinguish identical occurrences. Both runs completed; the app/source/fixtures were unchanged. **These assertions confirm existing behavior, including defects; they are not acceptance passes for a fix.** Temporary test source was removed from the application worktree. No broad build/test/CI run was needed for this read-only investigation.

## Why the reader looks certain

[SegmentAccordion.tsx](../components/reader/SegmentAccordion.tsx) checks the saved range, then searches exact text. At lines 83–84, failed search returns the original range, allowing unrelated words to be wrapped in a mark. Its closest-match search at lines 48–66 breaks equal-distance ties by retaining the first result. Legacy matching at lines 101–138 recursively marks repeated matches with the same ID.

[ReaderView.tsx](../components/reader/ReaderView.tsx) treats mark existence as successful location (lines 951–969), then spotlights it. It already has an explicit unmatched message at line 1173: “The saved passage could not be located in the current text. Your saved note is still available in Notes.” The false mark prevents that existing state from appearing. This explanation is confirmed by source; the controlled harness mounts SegmentAccordion rather than the complete ReaderView, so no new full-reader integration pass is claimed.

## Smallest proposed fix — not implemented

1. Never emit a mark from positions whose current text disagrees with the saved quotation when that quotation cannot be recovered confidently. Returning the old range on no match must stop.
2. For stale or missing positions, allow an exact occurrence only when it can be identified confidently within the original section. Multiple plausible occurrences without context must be unresolved; proximity alone is insufficient. Apply this policy to legacy records too. Preserve valid repeated-text anchors where they identify the intended occurrence.
3. Use the existing unmatched destination explanation instead of unrelated highlighting/spotlighting. Preserve the saved quotation and attached thought and existing Notes access. Do not auto-reassign another chapter or rewrite stored positions/quote/note during reading.

Acceptance for a future implementation: absent quote produces no false mark/spotlight and an explicit unmatched state; ambiguous stale/legacy matches do not silently choose first/closest/all; valid repeated anchors, uniquely identifiable repairs, Markdown boundary drift and multi-node highlights remain correct. Verify the existing full-reader message through browser→lookup→render with controlled revisions and duplicates. Ownership and saved data must remain unchanged. Draft protection, automatic editor opening, new retrieval controls and source-history UI are outside this change.

## Status

Investigation complete; proposal awaits separate implementation authorization. Confidence high in the demonstrated failure and revision comparison. No claim that every legacy highlight is affected or that unchanged code is harmless. Source content was not repaired, saved notes were not edited, and no fix was deployed. One agent; no model-provider calls or new hosted resource. Exact elapsed time and billing usage were not recorded.
