# Bounded AI chat acceptance

This is a local-candidate evaluation, not a deployment or load test. It uses the
application's actual routes, hosted services and temporary private test accounts.
It does not change prompts, model settings, quotas or public content.

Prepare a frozen `plan.json` containing `pilot`, `held`, `publicSources` and
`fixtures`, plus its public `sources.json` snapshot, in `AI_ACCEPTANCE_OUTPUT`.
Use the same questions and expected answers throughout a candidate run. Never
replace unsuccessful semantic responses or tune against held-out outcomes.
Retain separate incomplete acquisition records and corrected-fixture validations.

Required environment:

- `AI_ACCEPTANCE_ORIGIN`: a loopback candidate URL, never the live website.
- `AI_ACCEPTANCE_OUTPUT`: a private evidence directory outside committed inputs.
- `AI_ACCEPTANCE_ENV_FILE`: existing credential file, read only in memory.
- `AI_ACCEPTANCE_PROJECT_REF`: exact authorized fixture database identity.
- `AI_ACCEPTANCE_AUDIT`: one cumulative JSONL provider ledger for the entire task.
- `AI_ACCEPTANCE_PRIOR_USD`: verified prior upper spend, including earlier attempts.

Launch only the owned local server with the audit preload, using its absolute
path in `NODE_OPTIONS=--import /absolute/path/ai-chat-acceptance-audit.mjs` and the
same audit/prior-spend variables. Supply existing service credentials securely;
never print them or copy them into evidence. Test-only replay signing keys may be
created in memory for the local server. This does not provision infrastructure.
The preload blocks provider calls that would exceed the original cumulative US$5
cap, retains full-context reservations for unknown usage, and rejects OpenAI model
or reasoning settings other than Luna/none. Do not delete the ledger to reset a
budget. Stop on missing audit evidence.

Run from the candidate repository:

```sh
node --import tsx --test scripts/verification/ai-chat-acceptance.node-test.mjs scripts/verification/ai-chat-acceptance-audit.node-test.mjs
node --import tsx scripts/verification/ai-chat-acceptance.mjs pilot
```

Review all six answers against their frozen expectations, including exact text,
source attribution, citation resolution and privacy. Only a passing review may
create `pilot-review.json` with `passed: true`, and the exact `candidateHash` and
`planHash` from the completed pilot. This review is manual; do not infer semantic
quality from HTTP200. Required quote/citation checks must also pass. Then run:

```sh
node --import tsx scripts/verification/ai-chat-acceptance.mjs held
```

Held traffic is split into three disjoint ten-case chat groups, each with owned
fixtures. This keeps normal per-account allowances intact. Do not increase a
quota to make a benchmark pass. A highlight-only test requires an unnoted capture;
a capture with an attached note belongs to the Written notes filter.

Default acquisition is an authenticated streamed HTTP request with the same
payload and session identity as the app. `AI_ACCEPTANCE_HTTP=0` opts into browser
fetch capture; `AI_ACCEPTANCE_PILOT_MODE=ui` opts into interactive pilot acquisition.
Report acquisition modes explicitly. Request-to-first-text/completion timings on
a development candidate are not production click-to-paint measurements.

The harness revokes sessions, waits for browser API requests to settle, and deletes
only IDs it created. Independently verify cleanup, stop only the owned local
server, and retain all failures and unknown-cost allowances. This evaluation does
not replace required hosted release gates or authorize production promotion.
