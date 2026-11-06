# Library Ask conversation recovery

## Approved behavior

Preserve the active Library conversation, failed-turn retry state and separate
user-written unsent draft after ordinary navigation and same-tab reload. Keep
existing starter/follow-up suggestions, layout and typography. Submitted questions
stay in the thread; recovery never inserts a submitted/suggested question into the
composer or sends/retries automatically. The composer is empty unless the user
had an unsent draft. Recovery is bound to the verified account and auth session;
sign-out removes it. This is not server history or cross-device synchronization.

Start new chat is an explicit reset now that reload no longer discards the chat.
It sits beside Export (in the composer utility row on small screens), is disabled
during requests, rotates the recovered chat identity and confirms before dropping
an unsent draft. Resetting does not change saved library data or suggestions.

## Implementation

- Branch `codex/library-ask-recovery`, worktree
  `/Users/j/.codex/workspaces/netflux-library-ask-recovery`.
- Implementation commit `4975a525`, refreshed onto `097205af` after #327 merged.
  #327 is an independent shared-cover-card change, not a functional dependency;
  its updates are included in the final tested tree.
- Versioned, validated `sessionStorage` payload stores finalized messages, the
  unsent draft and pending/failed question identity. It rejects another owner and
  malformed records. No private text is placed in URLs, analytics or logs.
- Submission records the user turn before transport. Success saves the finalized
  conversation; failure/unfinished response keeps a retryable question without
  saving partial answers as complete. Retry reuses the existing user turn.
- Storage denial keeps SPA recovery in memory and discloses the reload limitation.
  A before-unload handler protects an unrecoverable chat/draft where browsers
  support it; a reload prompt is not guaranteed. Auth cleanup purges both stores.
- No schema, backend, provider, dependency or production-data changes.

## Verification — 7 November 2026

- **96 focused tests pass** across real-SDK Library recovery, existing Ask/Notes,
  storage ownership, auth refresh and sign-out cleanup. Coverage includes exact
  multiline drafts, success/failure/interruption, Retry, no automatic requests,
  suggestions, storage denial, late abandoned work and reset/discard confirmation.
- **199 security tests pass.** Final full lint/ratchets, standalone typecheck and
  production build pass, including five Sharp route traces and critical CSS.
- Actual built Next routes/API against a disposable full-migration local Supabase
  and local Redis passed the original failed/completed reload and Browse→Back
  cases, exact drafts, 390px mode return/reload, account/session isolation,
  pending reload and explicit Retry. The initial 21-observation browser run
  preceded the reset control; affected cases were repeated on the final build
  with #327 included. Final reset checks cover completed and failed conversations,
  empty state after reload, visible starter/follow-up suggestions, mobile control
  placement and no horizontal overflow. Native draft-discard Cancel/confirm is
  component-tested; browser reset used an empty draft.
- A loopback ingress supplies the expected local test forwarded IP. The fixture
  allows only over-length validation questions or the built-in context-missing
  clarification: eight requests total (four HTTP 400, four HTTP 200), all with one
  user turn. Repeated Retry keeps its question ID. No unexpected/automatic request,
  provider call, allowance row, saved library row or saved highlight row occurred.
- A pending reload can retain generic failure feedback when the browser cancels
  transport before unload. The unfinished question and exact newer draft still
  restore, and Retry remains explicit. An abandoned answer cannot overwrite them.
- Initial focused run: 26/27 passed; restored interruption feedback was incorrectly
  mapped through the generic SDK fallback. Corrected and reran affected checks.
  The first build was deliberately stopped while local environment setup was
  incomplete; it is not counted as a successful build.

## Limits and cleanup

The local shell also showed Sync unavailable feedback; saved-library sync was
outside this chat-only verification. Physical phones, Safari, hosted production,
provider/model interruption and cross-device history are unverified. Local auth
was real; test sign-in used a loopback fixture with ordinary synthetic accounts,
not email/OAuth UI. No change to provider cancellation or charging guarantees.

Both local test users were deleted after sign-out; SQL confirmed zero remaining
users/sessions and zero allowance/library/highlight rows. Own browser tabs,
Next server, fixture ingress, Redis and Supabase containers/volumes were removed;
private credentials and fixture environment were removed. User Chrome and the
primary checkout were untouched. Sanitized screenshots, fixture source and test
logs are retained in the task's `library-recovery-implementation` evidence folder.

Final local implementation and review are complete. Publication checkpoint:
ready for protected PR scope, full CI and Security Validation. No bypass or
production database rollout is required. Do not claim deployed verification from
these local results.
