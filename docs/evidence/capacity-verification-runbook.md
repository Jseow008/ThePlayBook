# #28 bounded capacity verification

Status: preparation only; no capacity result or launch clearance yet.
Application baseline: `7ebab7769d59b3bef2e62fcc5121a3bc44ca6475`.
Owner: platform engineering. This check does not replace functional, security,
retrieval-quality, or accessibility evidence.

## Initial envelope and interpretation

Use 25 simultaneously active authenticated accounts, with a brief burst to 50,
unless the owner chooses another envelope before execution. An active account
performs paced actions; it is not a continuously outstanding HTTP request.
Report offered actions/second, actual requests/second, maximum in-flight work,
completed actions and rejected actions alongside virtual-user counts.

This is a proposed first-launch envelope, not measured demand. Freeze the final
machine-readable scenario, corpus seed, application commit, platform configuration,
and thresholds before the measured run. Do not revise targets after seeing results.

## Isolation and prerequisites

- Dedicated hosted Supabase candidate in the existing organization, region matching
  production; synthetic accounts/content only. Fresh quoted-cost approval is pending.
- A dedicated hosted application deployment must point exclusively to candidate
  database, Auth, storage and restricted worker/maintenance connections. Never
  replace production environment variables or point a load runner at its aliases.
- Use a dedicated rate-limit/cache backend. Keep production admission rules and
  the approved $5/day global, $1/day shared guest AI policy enabled. Real provider
  requests consume paid API allowance; cap this run's provider reservations at $1.
- Record candidate and production runtime, region, compute, pool configuration and
  rate-limit configuration, without secrets. Record every difference; if parity
  cannot be established, limit the conclusion to the tested configuration.
- Reject production project ref `xmuqsgfxuaaophxnwure` and production hostnames.
  Pin the candidate deployment ID/host and database ref; refuse redirects to another
  host. Privileged credentials are for fixture setup/cleanup only, never user traffic.
- Replay migrations in a candidate-only directory. Verify ordinary account roles,
  real authenticated sessions, restricted connections, indexing readiness, spending
  admission and an end-to-end sample before load. Reuse unchanged prior security
  evidence; do not repeat unrelated benchmarks merely to populate this report.

## Bounded scenario

Use a deterministic synthetic corpus of 10,000 published items/100,000 segments,
reusing the search-evidence generator where possible. Give each of 50 ordinary
accounts 100 library records and 10 reflections, with unique expected search text.
One export account additionally has 1,201 library records to cross a page boundary.
Do not index the entire catalog through a paid provider for this test. Index only
personal evidence needed by the bounded AI sample; disclose semantic recommendation
coverage separately from lexical catalog coverage.

1. Preflight: one complete action of each type, then a 2-user, 30-second development
   sample. Stop on incorrect data or configuration; do not start full load blindly.
2. Warm-up: 2 minutes, excluded from latency percentiles but retained in raw evidence.
3. Steady: 25 users for 10 minutes, each starting at most one core action every
   10 seconds, with deterministic staggered starts and one in-flight action per user.
4. Burst: 50 users for 2 minutes at the same pacing. Record scheduling lag and
   dropped starts; do not silently reduce offered load when the service slows down.
5. Recovery: 5 users for 2 minutes. Verify outstanding operations settle and ordinary
   action latency returns within the same targets.

Core action mix: 60% catalog searches (including filtered/paginated queries),
20% browse/reader navigation, 15% library save/remove/progress mutations, 5%
reflection reads/writes. Record the exact request sequence and write/read split in
the scenario. Use real route payloads, exact mutation acknowledgements and expected
synthetic results; HTTP 200 alone is not a successful action.

Overlay six complete exports across distinct accounts (maximum two simultaneous),
including the 1,201-record account. Verify every requested collection, page, hash
and expected fixture record. Measure whole-export completion, not just snapshot
creation. Overlay up to four real Notes retrieval requests, maximum two simultaneous,
with known expected evidence and sufficient conservative budget reservations.
Record each AI result individually; four samples cannot establish an AI p95 or
maximum AI throughput. Provider-limited work remains a separate measured constraint.

## Admission versus capacity

Existing limits include browse recommendations at 10 requests/network/minute,
reflection POST at 12/network/minute, AI at 60/network/minute plus account limits,
and full-export creation at 2/account/hour. Read the actual deployed rules before
execution; these are not permissions to weaken them.

One generator IP models a shared network, not 50 independent home connections.
Do not forge trusted ingress headers. Report this topology explicitly. For routes
limited by network admission, pace within the limit for admitted-service measurements;
record omitted demand. A separate short admission probe may deliberately exceed the
limit and must verify a correct restriction response without counting it as useful
completed work. If a representative workload cannot be admitted, the result is
'admission constrained', not a capacity pass. Broader independent-network claims
require additional real ingress locations or a separately reviewed workload.

## Proposed pass/fail targets

These targets are frozen before execution, not claimed current product performance.

| Measure | Target |
| --- | --- |
| Catalog search and reflection reads | p95 <= 2 seconds per route; at least 100 admitted samples per reported p95 |
| Browse/reader HTTP actions | p95 <= 3 seconds; at least 100 admitted samples per reported p95; report recommendation API separately |
| Library mutations | p95 <= 2 seconds; at least 100 admitted samples |
| Reflection writes | p95 <= 2 seconds; at least 30 admitted samples; disclose limited sample size |
| Complete export | Each of six <= 60 seconds and correct; no percentile claim |
| Real AI retrieval | Each admitted sample <= 30 seconds and expected evidence present; no percentile claim |
| Unexpected HTTP/server/transport failures | <= 1% overall AND per operation; all failures explained; zero data-integrity/isolation failures |
| Scheduling | >= 99% planned core actions started; lag/drops reported, not discarded |
| Provider budget | At most $1 conservatively reserved for setup and measured AI calls together, within enabled $5/$1 policy |

Report p50/p95/max, sample size, status distribution, timeouts, restrictions, semantic
failures, scheduling lag, and durations per phase/operation. Exclude expected admission
probes from useful-success denominators, but retain them in their own totals. Never
exclude unexpected 429s from launch-workload feasibility. Count retries separately;
no automatic replay of failed measurements to obtain a green result.

Abort immediately on cross-account evidence, incorrect mutation/export data, target
identity changes, or disabled admission. Abort load if 5xx/transport failures exceed
5% of the last 100 requests or the configured cost/request/time bound is reached.
Every request needs a deadline; the complete scenario has a 20-minute hard limit
excluding build, seeding and the explicit development sample. Record early stops as
incomplete/failed, never as passing reduced samples.

## Evidence and closeout

Retain sanitized scenario/configuration, corpus counts, commit/build identity,
load-generator location, all aggregated outcomes, DB connection/CPU observations
where available, and aggregate provider ledger usage. Application logs and account
IDs/tokens/content are not public evidence. Infrastructure billing may be delayed;
record quoted project cost and billed cost as unavailable until independently known.

Fix only demonstrated bottlenecks. After a correction, rerun affected evidence;
keep the prior failure and changed inputs. Stop after two failed approaches to
reassess rather than expanding infrastructure speculatively.

Delete synthetic users/data, hosted candidate, temporary application/rate backend
and private credentials after retention. Record cleanup identities and confirmation
without secrets. #28 closes only after the envelope is tested and its limitations
are recorded; preparing this document does not close it.
