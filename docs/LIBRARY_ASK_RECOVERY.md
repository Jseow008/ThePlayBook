# Library Ask conversation recovery

Owner-approved scope: preserve the active Library conversation and separate
user-written unsent draft after ordinary navigation and same-tab reload. Keep
existing starter/follow-up suggestions and layout. Submitted questions stay in
the thread; recovery never fills the composer with a sent/suggested question or
sends/retries automatically. Recovery belongs to a verified account + auth
session, with sign-out cleanup and no server/cross-device history.

## Implementation checkpoint

- Branch `codex/library-ask-recovery`, worktree
  `/Users/j/.codex/workspaces/netflux-library-ask-recovery`.
- Base `05c3375e` from freshly fetched main. #327 is an independent shared-cover
  card change; it does not touch Ask recovery and is not a dependency.
- Implementation in progress, not committed/published. Storage, request lifecycle
  and auth cleanup added; tests and browser verification pending.
- No schema, backend, provider, dependency or production-data changes.
- Preserve saved completed messages/failed turn and draft independently. Pending
  submissions restore as interrupted, not completed or automatically retried.
- Next: finish restored error/storage-failure UI, exercise real SDK failure,
  completion, navigation remount, newer typing, interruption and identity cleanup.

## Verification before publication — 7 November 2026

- 96 focused tests pass across real-SDK Library recovery, existing Ask/Notes,
  storage ownership, auth/session refresh and sign-out cleanup. They cover exact
  multiline drafts, success/failure/interruption, one-turn Retry, no automatic
  requests, suggestions, storage denial, late abandoned work and reset/discard.
- Initial focused run:26/27 passed; restored interruption feedback was being
  mapped to the generic SDK fallback. Corrected the restored-message path and
  reran affected checks; all final focused tests above pass.
- Security suite199 tests passed. Lint/ratchets and standalone typecheck passed
  before the final reset utility; final checks are running again.
- Built production Next app passed typechecking,5 Sharp route traces and critical
  CSS checks. The first build was deliberately stopped while local environment
  setup was incomplete; no success is claimed for that canceled run.
- Actual Next routes/API against a disposable full-migration local Supabase and
  local Redis passed21 browser observations: all original failed/completed
  reload and Browse→Back losses, exact drafts,390px mode return/reload, local
  account/session isolation, pending reload and explicit retry. No app/router/auth
  mock; loopback ingress supplies the expected test forwarded IP. Fixture blocks
  unexpected questions so only validation and built-in clarification requests run.
- Repeated Retry used the same question ID with one user turn. No automatic
  requests after restoration. Newer drafts remain separate; suggestions enabled.
- Pending reload can persist generic failure feedback when browser cancellation
  occurs before unload. The unfinished question and exact newer draft restore,
  Retry remains explicit, and the abandoned answer cannot overwrite recovery.
- Fixture shell also showed Sync unavailable feedback; saved-library sync was
  outside this chat-only check. Physical devices, Safari, hosted deployment,
  model/provider failures and cross-device history remain unverified.

An explicit Start new chat utility is necessary now that reload is no longer an
implicit discard action. It sits beside Export (in the composer utility row on
small screens), is disabled during requests, rotates the recovered chat identity,
and confirms before discarding an unsent draft. It does not change suggestions,
retrieval or saved library data. Final built-browser reset check is pending.

All browser fixtures are local; no production data or paid provider calls. The
initial21-observation build preceded the reset utility; affected browser checks
will be repeated on the final build before publication. Local setup/private
artifacts will be removed after verification. No PR yet.
