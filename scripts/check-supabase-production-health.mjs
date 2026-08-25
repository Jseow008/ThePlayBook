#!/usr/bin/env node

import { fileURLToPath } from "node:url";

const MANAGEMENT_API = "https://api.supabase.com/v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const METRICS_SQL = `
select jsonb_build_object(
  'database_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
  'storage_bytes', (
    select coalesce(sum(
      case
        when (metadata->>'size') ~ '^[0-9]+$' then (metadata->>'size')::bigint
        else 0
      end
    ), 0)
    from storage.objects
  ),
  'storage_objects', (select count(*) from storage.objects),
  'connections_used', (
    select count(*)
    from pg_catalog.pg_stat_activity
    where datname = pg_catalog.current_database()
  ),
  'connections_active', (
    select count(*)
    from pg_catalog.pg_stat_activity
    where datname = pg_catalog.current_database() and state = 'active'
  ),
  'max_connections', pg_catalog.current_setting('max_connections')::int,
  'lock_waiters', (
    select count(*)
    from pg_catalog.pg_stat_activity
    where datname = pg_catalog.current_database() and wait_event_type = 'Lock'
  ),
  'long_transactions', (
    select count(*)
    from pg_catalog.pg_stat_activity
    where datname = pg_catalog.current_database()
      and xact_start is not null
      and pg_catalog.now() - xact_start > interval '5 minutes'
  ),
  'slow_query_fingerprints', (
    select count(*)
    from extensions.pg_stat_statements
    where dbid = (
      select oid from pg_catalog.pg_database where datname = pg_catalog.current_database()
    )
      and calls >= 20
      and mean_exec_time >= 1000
  ),
  'narration_queued_over_1h', (
    select count(*)
    from public.content_item
    where narration_status = 'queued'
      and narration_requested_at < pg_catalog.now() - interval '1 hour'
  ),
  'narration_processing_over_1h', (
    select count(*)
    from public.content_item
    where narration_status = 'processing'
      and narration_started_at < pg_catalog.now() - interval '1 hour'
  ),
  'narration_failed_24h', (
    select count(*)
    from public.content_item
    where narration_status = 'failed'
      and updated_at >= pg_catalog.now() - interval '24 hours'
  ),
  'notification_queued_over_15m', (
    select count(*)
    from public.content_request_notifications
    where status = 'queued'
      and queued_at < pg_catalog.now() - interval '15 minutes'
  ),
  'notification_processing_over_15m', (
    select count(*)
    from public.content_request_notifications
    where status = 'processing'
      and processing_started_at < pg_catalog.now() - interval '15 minutes'
  ),
  'notification_failed_24h', (
    select count(*)
    from public.content_request_notifications
    where status = 'failed'
      and updated_at >= pg_catalog.now() - interval '24 hours'
  )
) as health;
`;

const LOGS_SQL = `
select
  countIf(
    source = 'edge_logs'
    and toInt32OrZero(log_attributes['response.status_code']) between 500 and 599
  ) as api_5xx,
  countIf(
    source = 'postgres_logs'
    and match(log_attributes['parsed.error_severity'], 'ERROR|FATAL|PANIC')
  ) as database_errors,
  countIf(
    source = 'postgres_logs'
    and match(log_attributes['parsed.error_severity'], 'FATAL|PANIC')
  ) as database_critical
from logs
where source in ('edge_logs', 'postgres_logs');
`;

function numberFromEnv(env, name, fallback) {
  const value = env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function parseJsonValue(value) {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeMetrics(payload) {
  const row = normalizeRows(payload)[0] ?? {};
  return parseJsonValue(row.health) ?? row;
}

function normalizeLogs(payload) {
  return normalizeRows(payload)[0] ?? {};
}

function ageInHours(value, now) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - timestamp.getTime()) / (60 * 60 * 1000));
}

function evaluateHealth({ project, metrics, logs, backups, env = process.env, now = new Date() }) {
  const warnings = [];
  const failures = [];
  const observations = [];

  const databaseQuota = numberFromEnv(env, "DB203_DATABASE_QUOTA_BYTES", 500_000_000);
  const storageQuota = numberFromEnv(env, "DB203_STORAGE_QUOTA_BYTES", 1_000_000_000);
  const warningRatio = Number(env.DB203_CAPACITY_WARNING_RATIO ?? 0.8);
  const criticalRatio = Number(env.DB203_CAPACITY_CRITICAL_RATIO ?? 1);
  const connectionWarningRatio = Number(env.DB203_CONNECTION_WARNING_RATIO ?? 0.8);
  const connectionCriticalRatio = Number(env.DB203_CONNECTION_CRITICAL_RATIO ?? 0.9);
  const maxApi5xx = Number(env.DB203_MAX_API_5XX_24H ?? 5);
  const maxDatabaseErrors = Number(env.DB203_MAX_DATABASE_ERRORS_24H ?? 5);
  const maxSlowFingerprints = Number(env.DB203_MAX_SLOW_QUERY_FINGERPRINTS ?? 5);
  const recoveryMaxHours = Number(env.DB203_RECOVERY_POINT_MAX_HOURS ?? 24);
  const restoreDrillMaxHours = Number(env.DB203_RESTORE_DRILL_MAX_HOURS ?? 2160);
  const narrationWorkerEnabled = ["1", "true", "yes"].includes(
    String(env.DB203_NARRATION_WORKER_ENABLED ?? "false").toLowerCase(),
  );
  const requireHostedBackup = ["1", "true", "yes"].includes(
    String(env.DB203_REQUIRE_HOSTED_BACKUP ?? "false").toLowerCase(),
  );

  if (project?.status !== "ACTIVE_HEALTHY") {
    failures.push(`Supabase project status is ${project?.status ?? "unknown"}`);
  }

  const databaseRatio = Number(metrics.database_bytes ?? 0) / databaseQuota;
  const storageRatio = Number(metrics.storage_bytes ?? 0) / storageQuota;
  observations.push(`Database capacity: ${(databaseRatio * 100).toFixed(1)}% of configured quota`);
  observations.push(`Storage capacity: ${(storageRatio * 100).toFixed(1)}% of configured quota`);

  if (databaseRatio >= criticalRatio) failures.push("Database capacity reached the critical threshold");
  else if (databaseRatio >= warningRatio) warnings.push("Database capacity reached the warning threshold");

  if (storageRatio >= criticalRatio) failures.push("Storage capacity reached the critical threshold");
  else if (storageRatio >= warningRatio) warnings.push("Storage capacity reached the warning threshold");

  const connectionRatio = Number(metrics.connections_used ?? 0) / Math.max(1, Number(metrics.max_connections ?? 1));
  observations.push(`Connections: ${metrics.connections_used ?? 0}/${metrics.max_connections ?? 0}`);
  if (connectionRatio >= connectionCriticalRatio) failures.push("Database connections reached the critical threshold");
  else if (connectionRatio >= connectionWarningRatio) warnings.push("Database connections reached the warning threshold");

  if (Number(metrics.lock_waiters ?? 0) > 0) failures.push(`${metrics.lock_waiters} database session(s) are waiting on locks`);
  if (Number(metrics.long_transactions ?? 0) > 0) failures.push(`${metrics.long_transactions} transaction(s) have been open for more than five minutes`);

  const slowFingerprints = Number(metrics.slow_query_fingerprints ?? 0);
  if (slowFingerprints > maxSlowFingerprints) failures.push(`${slowFingerprints} recurring query fingerprints average at least one second`);
  else if (slowFingerprints > 0) warnings.push(`${slowFingerprints} recurring query fingerprint(s) average at least one second`);

  const staleNarration = Number(metrics.narration_queued_over_1h ?? 0) + Number(metrics.narration_processing_over_1h ?? 0);
  const recentNarrationFailures = Number(metrics.narration_failed_24h ?? 0);
  if (narrationWorkerEnabled && (staleNarration > 0 || recentNarrationFailures > 0)) {
    failures.push(`Narration worker has ${staleNarration} stale and ${recentNarrationFailures} recently failed job(s)`);
  } else if (staleNarration > 0 || recentNarrationFailures > 0) {
    warnings.push(`Narration is not scheduled; ${staleNarration} stale and ${recentNarrationFailures} recently failed job(s) need manual review`);
  }

  const staleNotifications = Number(metrics.notification_queued_over_15m ?? 0) + Number(metrics.notification_processing_over_15m ?? 0);
  const recentNotificationFailures = Number(metrics.notification_failed_24h ?? 0);
  if (staleNotifications > 0 || recentNotificationFailures > 0) {
    failures.push(`Request-notification worker has ${staleNotifications} stale and ${recentNotificationFailures} recently failed job(s)`);
  }

  const api5xx = Number(logs.api_5xx ?? 0);
  const databaseErrors = Number(logs.database_errors ?? 0);
  const databaseCritical = Number(logs.database_critical ?? 0);
  observations.push(`Last 24h: ${api5xx} API 5xx, ${databaseErrors} database error(s), ${databaseCritical} FATAL/PANIC`);
  if (databaseCritical > 0) failures.push(`${databaseCritical} FATAL/PANIC database log event(s) occurred in the last 24 hours`);
  if (api5xx > maxApi5xx) failures.push(`${api5xx} API 5xx responses exceeded the 24-hour threshold of ${maxApi5xx}`);
  if (databaseErrors > maxDatabaseErrors) failures.push(`${databaseErrors} database errors exceeded the 24-hour threshold of ${maxDatabaseErrors}`);

  const backupList = normalizeRows(backups?.backups ?? backups);
  const pitrEnabled = Boolean(backups?.pitr_enabled);
  observations.push(`Hosted recovery: PITR ${pitrEnabled ? "enabled" : "disabled"}; ${backupList.length} retained backup(s)`);
  if (requireHostedBackup && !pitrEnabled && backupList.length === 0) {
    failures.push("No hosted backup or PITR recovery point is available");
  } else if (!pitrEnabled && backupList.length === 0) {
    warnings.push("No hosted backup or PITR recovery point is available; relying on independent recovery points");
  }

  const freshnessChecks = [
    ["Database recovery point", env.DB203_DATABASE_RECOVERY_POINT_AT, recoveryMaxHours],
    ["Storage recovery point", env.DB203_STORAGE_RECOVERY_POINT_AT, recoveryMaxHours],
    ["Restore drill", env.DB203_RESTORE_DRILL_AT, restoreDrillMaxHours],
  ];
  for (const [label, value, maxHours] of freshnessChecks) {
    const age = ageInHours(value, now);
    if (age === null) failures.push(`${label} timestamp is not configured`);
    else if (!Number.isFinite(age)) failures.push(`${label} timestamp is invalid`);
    else {
      observations.push(`${label} age: ${age.toFixed(1)}h (maximum ${maxHours}h)`);
      if (age > maxHours) failures.push(`${label} is stale`);
    }
  }

  return { warnings, failures, observations };
}

async function apiRequest(path, { token, method = "GET", body, query } = {}) {
  const url = new URL(`${MANAGEMENT_API}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${method} ${url.pathname} failed: ${response.status} ${response.statusText}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!token || !projectRef) {
    console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF");
    process.exitCode = 2;
    return;
  }

  const end = new Date();
  const start = new Date(end.getTime() - DAY_MS);
  const encodedRef = encodeURIComponent(projectRef);
  const [project, metricsPayload, logsPayload, backups] = await Promise.all([
    apiRequest(`/projects/${encodedRef}`, { token }),
    apiRequest(`/projects/${encodedRef}/database/query/read-only`, {
      token,
      method: "POST",
      body: { query: METRICS_SQL, parameters: [] },
    }),
    apiRequest(`/projects/${encodedRef}/analytics/endpoints/logs`, {
      token,
      query: {
        sql: LOGS_SQL,
        iso_timestamp_start: start.toISOString(),
        iso_timestamp_end: end.toISOString(),
      },
    }),
    apiRequest(`/projects/${encodedRef}/database/backups`, { token }),
  ]);

  const result = evaluateHealth({
    project,
    metrics: normalizeMetrics(metricsPayload),
    logs: normalizeLogs(logsPayload),
    backups,
    now: end,
  });

  console.log("Supabase production health observations:");
  for (const observation of result.observations) console.log(`- ${observation}`);
  for (const warning of result.warnings) console.log(`::warning::${warning}`);
  for (const failure of result.failures) console.log(`::error::${failure}`);

  if (result.failures.length > 0) {
    console.error(`Status: failed (${result.failures.length} blocking condition(s))`);
    process.exitCode = 1;
  } else {
    console.log("Status: ok");
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

export { METRICS_SQL, LOGS_SQL, ageInHours, evaluateHealth, normalizeLogs, normalizeMetrics };
