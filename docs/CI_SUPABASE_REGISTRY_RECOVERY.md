# Supabase CI registry recovery

## Approved scope — 27 October 2026

Separate infrastructure change from product PR #287. That PR remains held until
required checks and the deployed scope-warning journey pass. No application,
production infrastructure, CLI/package version, image tag, migration or test
command changes are included here.

Two attempts failed preparing disposable Supabase: anonymous public ECR downloads
hit transfer/rate limits, GHCR fallback was throttled, and Docker Hub fallbacks
were denied. Logs: CI run 40361878605 and Security Gates run 40361878607 (attempts
1 and 2). This does not demonstrate an application regression or passing checks.

## Recovery and tradeoff

All five jobs that start Supabase in CI, Security Gates (including manual baseline)
and nightly responsive verification explicitly select `ghcr.io` and authenticate
with their own short-lived job token. Token permissions are read-only: contents
and packages, plus pull-request reads for Gitleaks in Security Validation.
Credentials are passed through stdin into a mode-700 Docker configuration folder
under the runner's temporary directory. They are never added to caches/artifacts.
An `always()` step logs public image digests, logs out and removes that folder,
even if login/setup/tests fail. This covers ordinary job success/failure; forced
runner termination relies on GitHub's disposable-runner teardown/token expiry.
Login failure prevents subsequent setup/tests from being treated as passed.

**Explicit registry selection disables Supabase CLI's ECR/GHCR/Docker Hub fallback
chain.** This is intentional and reversible through this isolated CI change.
No extra blind start retry or persistent credential is introduced. Existing
upstream-error retry handling, triggers, job timeouts, verification classification,
tests and release requirements are preserved. npm caching remains; Docker image
caching is deferred because it cannot repair a cold cache miss.

## Verification

- Workflow/YAML expression validation: actionlint 1.7.12 passed all three edited
  workflows (shellcheck unavailable; extracted shell blocks pass `bash -n`).
- Parsed comparison against origin/main confirms every original step, command and
  condition remains identical. Login conditions match Supabase setup conditions.
- Existing classifier selects full, database and responsive suites for the changes.
- Synthetic shell checks confirm isolated credentials are deleted after successful
  login and after rejected login plus failed logout; cleanup also handles no
  credentials/already removed. Synthetic token is absent from outputs/GITHUB_ENV.
- Local metadata checks found all 13 failed-run tags on GHCR with linux/amd64
  support. They do not establish authenticated hosted access or blob download.
  Source artifacts: /tmp/netflux-ci-registry-review-20261027.json and
  /tmp/netflux-registry-manifest-preflight.json. No private data or real token saved.

**Hosted trial pending:** require fresh GitHub-hosted runners, successful login,
actual image downloads, Supabase start/reset and all unchanged applicable gates.
Retain image digests from job logs. Manual-only/nightly paths not run by the PR
remain outside observed execution coverage unless separately exercised. If the
new authenticated path fails, inspect its evidence before another attempt.

After this infrastructure PR passes and merges normally, refresh #287 onto it,
validate the final candidate and release through protected gates. Verify READY
production and public alias for its actual merge SHA, then run only the approved
mismatch -> expand -> reload -> Use current filters sequence, preserving exact
synthetic multiline draft text. Keep skipped tests, phones/Safari and live network/
model-call failure gaps separate. No automatic follow-up created.

References:
- AWS retry guidance: https://docs.aws.amazon.com/AmazonECR/latest/userguide/common-errors.html
- ECR Public quotas: https://docs.aws.amazon.com/AmazonECR/latest/public/public-service-quotas.html
- GitHub workflow-token auth: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- Locked CLI registry behavior: https://github.com/supabase/cli/blob/v2.109.1/apps/cli/src/legacy/shared/legacy-docker-registry.ts

## Published hosted-trial checkpoint

Independent PR https://github.com/Jseow008/ThePlayBook/pull/288, branch
codex/ci-authenticated-supabase-registry, candidate
1a2e3d09df469cdf2d0fb92e5bd78c1352e38a82, base
32af562c9ba189e468dbc01c6f44a94bb3db4776. Four intended files; no #287 commits.
GitHub-hosted trial now pending. Keep subsequent run evidence local/uncommitted
until final checks finish to avoid restarting the candidate. No unchanged rerun
of the failed #287 jobs was dispatched. Next: inspect this candidate's hosted
login/download/start/reset/checks/cleanup, then normal protected squash merge if
all applicable required gates pass. Hold on failure; no automated follow-up.

Fresh-runner Catalog Search Evidence job 121991683318 completed authenticated
GHCR setup/start/reset, 5/5 runtime tests and credential cleanup. All 13 downloaded
image digests exactly match the independent local GHCR metadata baseline; this
is GHCR identity consistency, not independent proof of byte identity to ECR.
Job log retained locally at /tmp/netflux-ci-registry-catalog-hosted.log. Other
required jobs still pending; this partial result alone does not authorize merge.

Initial CI trial also exposed two real workflow-test failures: the new unconditional
catalog cleanup step selected itself for docs/presentation-only changes, although
no login was selected. Corrected only the new cleanup conditions to `always() &&`
the same verification scope as login/setup. This retains cleanup after failure
while skipping it when authentication is out of scope. No tests or existing
commands/conditions changed. The existing workflow/classifier suites pass 57/57
locally after correction, and actionlint passes. Final hosted candidate must rerun
its required gates; the earlier registry trial is evidence, not a substitute.
