import { describe, expect, it } from "vitest";

import {
  evaluateHealth,
  normalizeLogs,
  normalizeMetrics,
} from "../../scripts/check-supabase-production-health.mjs";

const now = new Date("2026-07-29T12:00:00.000Z");

function healthyInput(overrides = {}) {
  return {
    project: { status: "ACTIVE_HEALTHY" },
    metrics: {
      database_bytes: 64_000_000,
      storage_bytes: 500_000_000,
      connections_used: 10,
      max_connections: 60,
      lock_waiters: 0,
      long_transactions: 0,
      slow_query_fingerprints: 0,
      narration_queued_over_1h: 0,
      narration_processing_over_1h: 0,
      narration_failed_24h: 0,
      notification_queued_over_15m: 0,
      notification_processing_over_15m: 0,
      notification_failed_24h: 0,
    },
    logs: { api_5xx: 0, database_errors: 0, database_critical: 0 },
    backups: { pitr_enabled: false, backups: [] },
    env: {
      DB203_DATABASE_RECOVERY_POINT_AT: "2026-07-29T00:00:00.000Z",
      DB203_STORAGE_RECOVERY_POINT_AT: "2026-07-29T00:00:00.000Z",
      DB203_RESTORE_DRILL_AT: "2026-07-15T00:00:00.000Z",
    },
    now,
    ...overrides,
  };
}

describe("Supabase production health evaluation", () => {
  it("accepts healthy live metrics while warning about the accepted Free-plan backup gap", () => {
    const result = evaluateHealth(healthyInput());

    expect(result.failures).toEqual([]);
    expect(result.warnings).toContain(
      "No hosted backup or PITR recovery point is available; relying on independent recovery points",
    );
  });

  it("fails when Storage exceeds its configured quota", () => {
    const input = healthyInput();
    input.metrics.storage_bytes = 1_222_139_218;

    const result = evaluateHealth(input);

    expect(result.failures).toContain("Storage capacity reached the critical threshold");
  });

  it("fails closed when a recovery timestamp is missing or stale", () => {
    const input = healthyInput();
    delete input.env.DB203_STORAGE_RECOVERY_POINT_AT;
    input.env.DB203_DATABASE_RECOVERY_POINT_AT = "2026-07-25T00:00:00.000Z";

    const result = evaluateHealth(input);

    expect(result.failures).toContain("Storage recovery point timestamp is not configured");
    expect(result.failures).toContain("Database recovery point is stale");
  });

  it("warns for an unscheduled narration backlog and blocks it when scheduling is enabled", () => {
    const input = healthyInput();
    input.metrics.narration_queued_over_1h = 1;

    const unscheduled = evaluateHealth(input);
    expect(unscheduled.failures).toEqual([]);
    expect(unscheduled.warnings).toContain(
      "Narration is not scheduled; 1 stale and 0 recently failed job(s) need manual review",
    );

    input.env.DB203_NARRATION_WORKER_ENABLED = "true";
    const scheduled = evaluateHealth(input);
    expect(scheduled.failures).toContain(
      "Narration worker has 1 stale and 0 recently failed job(s)",
    );
  });

  it("normalizes read-only SQL and ClickHouse log responses without query text", () => {
    expect(normalizeMetrics({ result: [{ health: '{"database_bytes":42}' }] })).toEqual({
      database_bytes: 42,
    });
    expect(normalizeLogs({ result: [{ api_5xx: "2", database_errors: "1" }] })).toEqual({
      api_5xx: "2",
      database_errors: "1",
    });
  });
});
