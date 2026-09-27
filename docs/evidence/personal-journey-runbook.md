# Required combined personal-data journey (#26)

Run `JOURNEY_ENV_FILE=/private/path/config.json JOURNEY_EVIDENCE_PATH=/private/path/result.json node scripts/verification/run-personal-journey.mjs` from the repository checkout after installing dependencies and Chromium (`npx playwright install chromium`). This is an explicit release proof, not an optional skipped test in the default browser suite. Missing prerequisites or any failed stage exit nonzero. There are no automatic journey/model retries.

Use a clean isolated checkout without `.env`, `.env.local`, `.env.production` or `.env.production.local`; the launcher refuses these files so Next cannot reload unrelated credentials. The launcher builds the actual application with Webpack in production mode, owns the production server, and stops it afterward. It refuses an occupied port and remote database/API/application URLs. Use a dedicated local Supabase stack with the repository migrations already applied; do not point it at another developer's local project. Seed only the synthetic public article and confirmed ordinary account. Bookmark, reading progress and reflection are created through browser controls. An actual Supabase-generated OTP substitutes for test-mail delivery; the browser still uses the real login form and OTP verification route. This does not test external email delivery.

The private JSON configuration requires:

- `JOURNEY_BASE_URL`: unused loopback HTTP origin with an explicit port.
- `JOURNEY_DATABASE_URL`: disposable local administrator connection for fixture setup/assertions/cleanup.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`: that same disposable stack.
- `SNAPSHOT_WORKER_DATABASE_URL`, `SNAPSHOT_MAINTENANCE_DATABASE_URL`: the migrated restricted roles, provisioned with temporary login passwords in the same local database. Do not broaden their grants.
- `ACCOUNT_DATA_CURSOR_SECRET`, `CRON_SECRET`: new temporary random secrets.
- `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`: real providers, used only on synthetic text in this run.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: the approved limiter instance. Account IDs and trusted test network identities are unique, expiring test buckets. The launcher sets the trusted hosting flag locally; no production header or limiter configuration is changed.

Keep that file and raw logs private, outside Git. Do not copy production database URLs or telemetry credentials. The runner creates no hosted project, production account or production schema changes. Provider costs are bounded to one synthetic reflection index and one exact-quote retrieval. The disposable spending policy is temporarily enabled with the approved $5/day global and included $1/day guest ceiling, then restored during cleanup. Existing admission is exercised rather than disabled. Stop and investigate a failure; do not retry until a model happens to pass.

The required stages are:

1. Ordinary account signs in and completes welcome activation. It saves an article and writes a reflection through the reader.
2. The protected real indexing worker indexes that reflection using real embeddings.
3. The user signs out; database-backed assertions prove the old session is gone. A fresh browser context signs in and proves a different session exists.
4. Notes retrieves the saved reflection using the real embedding/selector path. The completed stream, displayed quotation and exact-quotation marker must agree with the original text.
5. Its returned citation opens the validated exact passage and source link.
6. Settings downloads a verified export. The bookmark and original reflection must each appear exactly once.
7. Browser contexts and owned server close; synthetic account/content removal is independently checked before successful evidence is written.

The retained JSON contains stage durations, build ID, outcome and counts; it excludes credentials, session IDs, citations, exported payloads and model text. Private runtime/failure logs are for local diagnosis only. Delete credentials/logs and stop only the disposable Supabase project owned by this run after retaining sanitized evidence.

This proof complements existing isolation, expiry, reset, revocation, pagination and responsive fixtures. It does not replace those tests or claim broad retrieval quality from one successful query.
