# Library latency phase measurements

Status: timing-only implementation; no measured improvement or capacity pass yet.
Branch: `codex/library-latency-timing`.
Worktree: `/Users/j/.codex/worktrees/library-latency-timing/Lifebook`.
Base: freshly fetched `origin/main` at `7ebab7769d59b3bef2e62fcc5121a3bc44ca6475`.

Finding #28's production preflight measured a successful save at 4,715ms and
read-back at 2,255ms. Production functions run in Virginia and the database in
Mumbai. Cumulative SQL execution times were much shorter, suggesting network or
connection overhead; those statistics cannot attribute the individual request.

Successful authenticated library save/list responses now carry `Server-Timing`:

- `auth`: client construction and authenticated user verification.
- `admission`: existing write-rate admission; omitted on the read route.
- `library`: complete existing library operation, including connection acquisition
  and all database round trips. This is not database execution time alone.
- `handler`: elapsed handler time up to response construction. This excludes platform
  startup, client transport and JSON serialization.

Only fixed labels and numeric millisecond durations are returned. No account IDs,
content, counts, SQL, credentials or error details are added. Headers are request-local,
success-only and retain `Cache-Control: no-store`. No extra database query, provider
call, logging, schema or authorization change is introduced.

Verification: the 28 existing/extended save/list route tests pass, including exact
phase attribution, unchanged acknowledgements, per-response state and no timing
header on unauthenticated responses. TypeScript and focused lint pass.

Next after required CI and deployment: two synthetic accounts, a fixed small sample
of saves/read-backs, capture client elapsed time and phase headers, verify exact
acknowledgement/read-back and clean up. Use these measurements to decide whether a
same-region candidate is warranted. Do not resume the full capacity ladder yet.
No temporary hosted database or billing upgrade is needed for this instrumentation.
