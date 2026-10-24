# Zod 3 migration baselines

Captured on 24 October 2026 before upgrading the isolated security worktree, from
main `66b63cec25cbffecb833e32306b7f646233b4d83` with Zod 3.25.76.

- `zod3-contract.json`: 31 representative cases built from the actual exported
  personal-scope, checklist and content-query schemas, plus the integer-counter
  primitive used by saved boundaries. Accepted values, defaults, normalized
  output and rejection paths were captured; non-finite output has a named JSON
  representation. Source cases are in `tests/helpers/zod-contract-cases.ts`.
- `zod3-selector-schema.json`: the installed AI SDK's real schema adapter applied
  to the actual personal selector output schema with synthetic candidate IDs A/B.
- `zod3-provider-schemas.json`: actual outgoing structured-output schema fields
  through the unchanged selector and real installed OpenAI, Anthropic and Luna
  adapters. Fetch returned controlled synthetic responses; no network/provider
  call occurred. This separately retains Anthropic's pre-existing sanitization.

Temporary capture tests were removed after writing these baselines. Capture logs
are retained locally under `/tmp/netflux-zod-plan/`; no Zod 3 test dependency or
runtime compatibility import was added to preserve them.

Decision: preserve legacy UUID-format acceptance with Zod 4 GUID validators.
Preserve supported finite values, defaults, trimming, enum/strictness constraints
and saved text. Deliberately reject non-finite query offsets and unsafe integer
counters; the contract test marks these two acceptance differences explicitly.
Engine-generated issue wording/codes may change, but public status, top-level
error/details shape, field paths and application-authored messages are tested.

These fixtures establish validation compatibility, not semantic retrieval
quality and not the cause of the historical Ask service failure.
