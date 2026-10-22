# Saved quotation and marked-passage mismatch

**Finding:** this is a content-revision anchoring defect. The saved quotation and location were valid against the historical section. The same section record now contains a different chapter. When the quotation is absent, the renderer falls back to those stale positions and emphasizes unrelated words. Confidence is high for this record and mechanism. The authorized rendering fix is now implemented locally; no data repair has been made.

## Scope and checkpoint

This investigation is separate from completed PR #276, draft protection and optional retrieval/editor UX. Worktree `/tmp/netflux-highlight-quotation-investigation`, branch `codex/highlight-quotation-investigation`, freshly fetched base/source `b10fb615c0f2e571e8fcc506fb9bb3e99420fd2b`. The user authorized the bounded fix after this investigation. Application changes are limited to section-local quotation validation and the existing unavailable-destination copy. No production writes, migration, historical restoration, deployment or paid project has been performed for this change; Local validation is complete and [PR #277](https://github.com/Jseow008/ThePlayBook/pull/277) is open. The previous worktree and primary Lifebook checkout were left unchanged after removing the temporary diagnostic test.

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

## Why the reader looked certain before this fix

This subsection describes the pre-fix source at `b10fb615`; its line numbers refer to that revision.

[SegmentAccordion.tsx](../components/reader/SegmentAccordion.tsx) checks the saved range, then searches exact text. At lines 83–84, failed search returns the original range, allowing unrelated words to be wrapped in a mark. Its closest-match search at lines 48–66 breaks equal-distance ties by retaining the first result. Legacy matching at lines 101–138 recursively marks repeated matches with the same ID.

[ReaderView.tsx](../components/reader/ReaderView.tsx) treats mark existence as successful location (lines 951–969), then spotlights it. It already has an explicit unmatched message at line 1173: “The saved passage could not be located in the current text. Your saved note is still available in Notes.” The false mark prevents that existing state from appearing. This explanation is confirmed by source; the controlled harness mounts SegmentAccordion rather than the complete ReaderView, so no new full-reader integration pass is claimed.

## Authorized implementation

1. Never emit a mark from positions whose current text disagrees with the saved quotation when that quotation cannot be recovered confidently. Returning the old range on no match must stop.
2. For stale or missing positions, allow an exact occurrence only when it can be identified confidently within the original section. Multiple plausible occurrences without context must be unresolved; proximity alone is insufficient. Apply this policy to legacy records too. Preserve valid repeated-text anchors where they identify the intended occurrence.
3. Use the existing unmatched destination explanation instead of unrelated highlighting/spotlighting. Preserve the saved quotation and attached thought and existing Notes access. Do not auto-reassign another chapter or rewrite stored positions/quote/note during reading.

Acceptance for this implementation: absent quote produces no false mark/spotlight and an explicit unmatched state; ambiguous stale/legacy matches do not silently choose first/closest/all; valid repeated anchors, uniquely identifiable repairs, Markdown boundary drift and multi-node highlights remain correct. Verify the existing full-reader message through browser→lookup→render with controlled revisions and duplicates. Ownership and saved data must remain unchanged. Draft protection, automatic editor opening, new retrieval controls and source-history UI are outside this change.

## Implementation and verification checkpoint

The resolver first accepts a valid integer stored range whose exact text still equals the saved quotation, even when that quotation repeats. Otherwise it accepts exactly one exact occurrence in the original section; absent, ambiguous (including overlapping occurrences), empty, case-only and whitespace-only guesses are unresolved. Legacy records use the same section-wide rule. It never changes its input. Validation runs on the sanitized rendered HTML tree, including the exact block-separator text used by DOM selection capture. Marks are emitted as text-bearing tree nodes, without reparsing saved quotations as HTML. The wrapper receives only validated ranges, and ReaderView continues to use those same rendered marks for linked navigation. Its existing unmatched message now begins **“Saved passage could not be located.”**

Layout, typography, breakpoints, themes, editor behavior, API lookups, account ownership enforcement, hydration and mutations are unchanged. The once-per-destination scroll guard remains unchanged. No historical content has been restored. Rendering-only scope does not change a database-facing path covered by OPS §2.2; no new paid project or hosted rehearsal is proposed or claimed. #276's evidence remains evidence for its unchanged lookup/draft behavior, not for this new resolver.

Completed evidence on this candidate:

- Focused tests: **107/107** across the actual accordion, ReaderView integration and anchor edge cases. Twenty-two desktop/mobile integration cases mount the real Markdown renderer, compare manual rendering with linked opening, preserve a frozen quotation/thought record, and ensure no recovery in another section. They distinguish matching second occurrences from ambiguous stale/legacy duplicates, including after a Markdown heading. Three additional round-trip tests use the real getTrimmedSelection helper to capture positions from rendered text before rerendering the highlight.
- Private historical/current source replay: **8/8 scenario assertions**. Historical source still marks `concentration` at 672; current source now emits no mark rather than ` retained hig`. No private source fixture or note body is added to Git.
- Browser: **20/20** controlled cases, ten each at 1440×1000 and 390×844; unchanged, shifted, replaced, missing, matching second duplicate, stale duplicate, legacy duplicate, matching/stale duplicates after a Markdown heading, inline Markdown split. Real ReaderView, SegmentAccordion, resolver, Markdown pipeline, media queries and CSS; synthetic hook data, routing adapter and unrelated controls. This is component/browser evidence, **not browser→API→hosted database evidence**. All target marks were in the saved section; unavailable cases had no target mark and displayed the explicit alert. No horizontal overflow. Viewport override reset and own tab closed.
- Final lint (including repository guards), TypeScript, production build, Sharp trace and critical CSS checks passed after the rendered-position correction. Build used synthetic local environment values, without a running database or production credentials. Final isolated full suite: **245 files / 1,874 tests passed**, **10 files / 287 tests skipped** (not verified coverage); capacity harness **34/34**. All earlier complete-suite results are superseded for this renderer. Production dependency audit remains applicable with unchanged lockfile: **0 vulnerabilities**. No final CI/security claim yet.

Review correction before release: the initial candidate validated the Markdown syntax tree, whose block separators differ from the DOM positions recorded by selection capture. This could reject an unchanged repeated quotation after a heading. A final review caught the representation mismatch before auto-merge was enabled. Validation moved after raw HTML parsing and sanitization to the rendered text tree. The prior proximity-based test was corrected to preserve its genuinely matching DOM positions; new tests separately cover stale duplicate positions. Earlier browser/focused/full-suite passes did not cover this selection-capture boundary and do not validate the changed renderer. Affected browser, focused, historical replay, lint, type and build checks were repeated successfully; the final isolated broad suite also passed.

Failed/setup attempts retained: browser harness initially failed because an alias adapter did not substitute the progress hook; corrected the adapter. A DOM read attempted an unsupported Range method; replaced it with paragraph HTML inspection (test integration separately verifies exact text offset). Waiting for the intentionally temporary spotlight after it expired timed out; permanent marks and the integration spotlight assertion were used instead. One harness case-link click during smooth scroll did not navigate (URL remained previous case); subsequent navigation used the displayed link destination and verified the resulting case. These were not counted as successful scenario observations. The first broad suite discovered a temporary private replay test just before cleanup removed it; that run must not be reported as a passing final suite. A later attempt to run the complete suite concurrently with build, lint and two type-check processes hit timeouts in unrelated Notes/Settings/Admin tests; it was stopped (exit 130) and is not passing evidence. The final broad run is isolated from those heavy tasks, with unchanged test time limits. Private replay and browser harness are retained outside the worktree at `/tmp/netflux-quote-investigation`.

Final application candidate **`533b8241`** is committed and pushed; the separate fix is tracked in [PR #277](https://github.com/Jseow008/ThePlayBook/pull/277). The GitHub file list matches the intended nine files, including the preceding investigation evidence; no unrelated commits are included. Initial application candidate `5904ee7e` is superseded by the rendered-position correction described above; final application source hashes in the candidate evidence bind the revised implementation. Squash auto-merge is permitted only after the PR scope check passes; required validate and Security Validation remain merge gates. Next action: complete those PR gates and address any actual failures before release. No post-merge deployment check is claimed for this new change. Primary Lifebook checkout and old #276 worktree remain untouched. One agent; no model-provider calls or new hosted resources. Exact billing usage is unavailable.
