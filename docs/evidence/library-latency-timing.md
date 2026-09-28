# Library latency phase measurements

Status: PR #185 merged; bounded staged-production diagnostic completed. No capacity pass.
Evidence branch: `codex/library-latency-evidence`.
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

## Measured diagnostic — 28 September 2026

PR #184 merged as `6cd056f8`; PR #185 merged as
`b9fe7c1015ecf01229637c4fdf21bb366a6cba33` after all required PR checks passed.
The exact production-target build `dpl_MX3Tv9LobyGA74pWtEznoktLeAUM` was READY
but staged while post-merge checks held the public alias. Following OPS's exact-URL
pre-promotion verification approach, the authorized diagnostic used that protected
build with existing verification access and the production backend. It did not
promote the deployment or bypass public-release checks.

Two ordinary synthetic accounts each saved, updated progress, and removed one
current published item, with exact revision and field read-back after each write.
All six writes and six reads succeeded. No catalog data changed and no AI/export
work ran. Numeric timings contain no user data or credentials.

| Mean across six requests | Client elapsed | Auth | Admission | Library operation | Handler |
| --- | ---: | ---: | ---: | ---: | ---: |
| Writes (save/progress/remove) | 4,234ms | 544ms | 184ms | 2,825ms | 3,555ms |
| Reads | 2,414ms | 642ms | Not applicable | 1,397ms | 2,040ms |

These are diagnostic means, not percentiles or a capacity pass. The library operation
accounts for most measured handler time; the rate limiter is not the dominant phase.
The operation includes connection setup and round trips. Previous cumulative SQL
execution statistics plus Virginia/Mumbai placement make regional network overhead
a strong hypothesis, but this sample does not isolate pure network time or prove a
region change's benefit. The first request is not a proven cold start.

Both synthetic sessions were revoked and accounts deleted. Run-owned library,
boundary and receipt counts are zero. Original account count (8), published catalog
count (496) and healthy detailed readiness remained unchanged. Temporary credentials
and private fixture state were removed after retaining the
[sanitized measurements](library-latency-sample-20260928.json).

Next: compare the same save/list routes deployed nearer the Mumbai database using
the same bounded fixture and measurements, retaining the current baseline. Keep
SQL, RLS, revisions, quotas and dataset constant. Do not buy additional Upstash
capacity or run the full load ladder on the strength of this diagnostic.

Efficiency: one coordinator, no new subagents or model experiments. Most elapsed
time was required CI and a strict branch-freshness rebase. The staged-build sample
avoided waiting for the second full CI cycle to promote public aliases, while
preserving that promotion gate. Codex token usage was not measured.
