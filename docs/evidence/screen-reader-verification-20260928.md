# Screen-reader verification (#27) — 28 September 2026

Owner: Codex (Engineering/QA). Application base: `55bbcdb8429cdcb5e3df150d0128dbd3766a2146` (#181). Scope: reflection capture, Notes answer states, validated citation navigation and Settings export. This is a focused accessibility correction, not a redesign or a claim of complete WCAG conformance.

[PR #182](https://github.com/Jseow008/ThePlayBook/pull/182) merged as `8c1ad354d45c364f205c9e5c86bae8e047ac9ddd` after required validation, security and scope checks passed. On 28 September 2026, the owner explicitly instructed: “That's fine, let's merge it and close #27 as well.” #27 is closed by owner acceptance of the documented spoken-output verification gap. This is not a passing VoiceOver result, a general accessibility certification, or a waiver for future unrelated releases. Deployment completion was not checked as part of this merge request.

## Evidence and fixes

| Surface | Finding / change | Evidence |
| --- | --- | --- |
| Reflection dialog | The textarea's visible prompt was not associated with it. Associate the prompt as its accessible name and provide privacy/length instructions. Keep the visual count, without a live announcement on every keystroke. | DOM accessibility-name/description test; opening focus and Escape focus restoration pass using the real overlay hook. |
| Notes sidebar and full page | Searching, response completion and failures lacked an announcement region. Add a persistent polite status region and a named, keyboard-focusable conversation region. Announce boundaries, not streamed tokens; preserve composer focus. | Both variants tested from idle → streaming → ready → failed; actual answer remains readable in the conversation. |
| Settings export | Progress was a live region nested in the disabled download button. Move the announcement to a persistent sibling status region and give the control an explicit name/description. | During a delayed export, the button is disabled while the separate status exposes actual progress. Existing cancellation/resume tests pass. |
| Citations | Existing validated-passage focus and keyboard behavior is unchanged. | Reuse the recorded #158 Chromium/WebKit/keyboard/200% text checks; no new spoken-output claim. |

Focused regression run: **35 tests pass across four files**. TypeScript and focused lint pass. The production Webpack build with placeholder public configuration passed; it does not prove an authenticated production journey. #26's complete real-service journey is unaffected and is not repeated for these semantic UI changes.

The implementation follows W3C's guidance on [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) and [labels/instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html). DOM assertions prove exposed semantics and state transitions; they do not prove what a particular screen reader speaks.

## Actual VoiceOver attempt — not passed

With the user's explicit permission, a dedicated Safari tab was opened and macOS VoiceOver was attempted through its shortcut and Accessibility settings. The settings switch showed On and the caption-panel preference was already enabled, but the desktop tool continued to report the VoiceOver process as not running. No speech-caption panel or observable VoiceOver navigation result became available. The initial direct VoiceOver launch also timed out. This establishes a verification-environment limitation, not a Netflux failure or a successful screen-reader test.

VoiceOver was switched Off again and that state was verified. The temporary Safari tab was closed. No VoiceOver caption preferences were changed. No production personal records, database/schema changes, paid verification projects or AI calls were needed.

## Retained spoken-output checklist (unexecuted)

#27 is closed under the owner decision above. Retain this unexecuted checklist for follow-up when a working screen-reader session is available, or when these interactions next change; it no longer blocks this release. Record the commit/deployment, OS/browser/screen-reader versions, tester/date and observed result for each step. Use an ordinary test account and synthetic text.

1. Open a reflection with the keyboard. Confirm the dialog title, reflection prompt and length/privacy instructions are spoken. Type a short reflection, then press Escape and confirm focus returns to the opener. Reopen and save; confirm the save feedback is spoken.
2. Open Ask These Notes. Submit a question and hear the searching state, then the response-ready announcement without every partial token being read. Navigate to the Notes conversation, read the answer and reach its supporting-passage link. Repeat in the full-page view.
3. With a controlled failed request, hear the failure and reach “Try again”; confirm the failed partial answer is not presented as complete. Avoid deliberately disrupting production services for this check.
4. Open the citation. Confirm focus and spoken output identify “Verified passage”; read the passage, reach “Read source”, and return to the originating view without losing keyboard access.
5. Start a Settings export. Confirm the control's name is clear and preparation/retrieval/verification/file-creation updates remain available while it is disabled. Confirm completion or an interrupted/error outcome is understandable. No precise spoken timing is promised; assistive technology may coalesce polite announcements.

Do not mark the checklist complete from an accessibility-tree dump, screenshots, DOM tests or the prior #26 journey alone. Existing WebKit/keyboard/text-size evidence remains separate from this remaining real screen-reader acceptance.
