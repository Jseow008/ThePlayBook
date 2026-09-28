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

## Mumbai-region candidate

Branch `codex/library-mumbai-region`, based on fresh `fd3660a3` main.
The candidate changes only Vercel's per-function region configuration for library
save and list routes to `bom1`. This follows Vercel's current
[per-function configuration](https://vercel.com/docs/functions/configuring-functions/region#per-function-configuration).
The installed Next.js guide marks `preferredRegion` deprecated, so no route export
or runtime change is introduced. SQL, auth, rate limits, read-back verification and
all other route placement stay unchanged.

Hold public rollout until a staged production-target build confirms the two route
placements and the same two-account/six-write/six-read diagnostic succeeds. Retain
raw sanitized phase measurements and cleanup proof. A faster small sample is not
#28 closure or a throughput claim. No temporary database or Upstash upgrade.

### Mumbai comparison completed

Candidate code commit `14ac11594b788e04da98d2d9a6cc14546a8d4e27` built successfully
as production-target deployment `dpl_3Btd7UfJH6xyFXAatjhHnh8nq6SP`, with automatic
alias assignment disabled. All 12 authenticated responses reported `bom1` execution
via their Vercel routing header. A health-route control still reported `iad1`,
confirming the change is scoped to the selected functions.

| Mean across six requests | Virginia baseline | Mumbai candidate |
| --- | ---: | ---: |
| Write client elapsed | 4,234ms | 945ms |
| Write library-operation phase | 2,825ms | 40ms |
| Read client elapsed | 2,414ms | 313ms |
| Read library-operation phase | 1,397ms | 14ms |

All six save/progress/remove operations and six revision/field read-backs passed.
The first save took 2,471ms; it remains above the frozen 2,000ms target and is not
excluded. The other five writes were below the target. This fixed small diagnostic
supports shipping the placement improvement, not claiming #28 completion or a p95.
It is a historical comparison, not a simultaneous randomized experiment; startup,
auth caching and changing external-service latency can affect totals. The large
library-phase reduction with unchanged SQL/application code supports avoiding the
cross-region path as the effective correction.

[All candidate samples](library-mumbai-sample-20260928.json) include routing-region,
phase and cleanup evidence. Both synthetic accounts, library rows, boundaries and
receipts were removed. Original account/catalog counts remain 8/496; detailed health
passed; the candidate did not receive the public alias. An initial identity preflight
stopped with zero samples/accounts because the preceding documentation release had
just moved the public alias. Its [record](library-mumbai-identity-preflight-20260928.json)
is retained; the expected baseline was updated only after verifying merged main
`fd3660a3`. No failed timing result was discarded or rerun for a favorable outcome.

Public rollout: PR #187, required checks and normal production deployment gates.
No migration. After promotion, verify routing and integrity on the public endpoint;
then resume the bounded capacity preflight with the original latency targets and
all startup observations retained. No Upstash upgrade is needed for this correction.

## Public production preflight — 28 September 2026

PR #187 merged as `bc33d7ab`; public alias `www.netflux.blog` serves READY/promoted
`dpl_BZMzdMGUp7RwWtg1gomd7RVw7u3D`. Its function configuration places both library
routes in Mumbai. Public unauthenticated probes returned expected 401 responses
with `sin1:bom1` routing; health returned 200 with `sin1:iad1`.

The existing production runner's two-account preflight completed all five semantic
actions (eight HTTP requests). Every request returned 200 and all read-back checks
passed. Escalation stopped on reader 3,203ms (limit 3,000ms) and first library save
2,542ms (limit 2,000ms). Library read was 308ms; search 1,169ms; reflection requests
776–1,391ms. No load ladder or provider/export overlay was started. These observations
remain failures; the regional improvement does not close #28.

[Retained request evidence](capacity-public-mumbai-preflight-20260928.json) was
reconstructed from runner stdout because the temporary wrapper's cleanup-verification
query used `user_id` instead of the receipts table's `account_id`. Both synthetic
sessions had already been revoked and accounts deleted. Corrected read-only checks
confirmed cleanup. The failure prevented saving phase headers and before-counts;
those unavailable values are not inferred. Future wrappers must persist measurement
evidence before cleanup and save cleanup results separately, including on errors.

Next: capture a bounded trace of the above-target save's auth, admission, library,
and platform time, plus the reader route's server work. Preserve this failed sample;
do not repeat the full preflight until a demonstrated bottleneck is corrected. The
remaining delay cannot yet be called a cold start, an Upstash problem, or slow SQL.

### Bounded phase attribution — 28 September 2026

The subsequent diagnostic used two ordinary synthetic accounts, two saves with
read-back, and two reader requests (six measured requests; no load ladder). Same
public deployment `bc33d7ab`. Every operation succeeded and passed semantic checks.
[Raw sanitized trace](library-reader-phase-trace-20260928.json) is retained before
cleanup, so cleanup/health failures cannot erase the measurements.

| Save phase | First save | Second save |
| --- | ---: | ---: |
| Client total | 2,189ms | 1,099ms |
| Auth | 537ms | 457ms |
| Admission | 448ms | 428ms |
| Library | 92ms | 21ms |
| Handler total | 1,079ms | 907ms |
| Client minus handler (unattributed) | 1,110ms | 192ms |

The library operation is no longer the dominant observed save cost. The residual
is not a cold-start measurement: platform startup, transport and response work
are outside the handler timer. Do not weaken getUser validation, admission, or
mutation correctness to hit the target. No Upstash upgrade is justified by this
trace alone.

Readers executed in `iad1` with cache MISS: totals 1,602/1,245ms, headers at
658/312ms, leaving about 943/933ms to finish the streamed response. Source inspection
confirms public content is checked with the anonymous client and React request-local
cache; optional series data follows the content lookup. These timings do not separate
query time from rendering/transport. Moving this route near its database is a
reasonable next controlled candidate; do not add stale-content caching or change
withdrawal visibility without its separate correctness proof.

The post-sample detailed-health guard returned 503, and the first final-health check
also returned 503. Traffic stopped. Bodies were not retained, so the specific failed
health component is unknown. A later read-only check returned 200, all readiness
checks ready, and database reachable. Both synthetic sessions were revoked and
accounts deleted; corrected verification found no remaining trace accounts or
orphaned library/reflection/boundary/receipt rows. Counts were 8 accounts and 603
total catalog rows before/after; 496 are published. No existing data was changed.

Next decision: keep load escalation held. Investigate the health failure and obtain
platform startup/request traces for the slow save; compare a reader-only Mumbai
candidate when health is stable. Existing runtime request logs lacked duration/startup
fields, so they do not establish the unexplained 1.11s. Do not keep repeating the
capacity preflight to obtain a favorable sample.
