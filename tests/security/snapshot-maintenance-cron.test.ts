import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260926043844_add_snapshot_maintenance_cron.sql"),
    "utf8",
);

describe("snapshot-maintenance cron migration", () => {
    it("keeps cleanup private, ordered, and scheduled", () => {
        expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;");
        expect(migration).toContain("CREATE OR REPLACE FUNCTION snapshot_private.reconcile_expired_account_data_snapshots()");
        expect(migration).toContain("SECURITY DEFINER");
        expect(migration).toContain("OWNER TO netflux_snapshot_maintenance;");
        expect(migration).toContain("GRANT netflux_snapshot_maintenance TO postgres\n    WITH INHERIT FALSE;");
        expect(migration).toContain("GRANT netflux_snapshot_maintenance TO postgres\n    WITH SET TRUE;");
        expect(migration).toContain("GRANT netflux_snapshot_maintenance TO postgres\n    WITH ADMIN TRUE;");
        expect(migration).toContain("GRANT CREATE ON SCHEMA snapshot_private TO netflux_snapshot_maintenance;");
        expect(migration).toContain("FROM PUBLIC, anon, authenticated;");
        expect(migration).toContain("TO postgres;");
        expect(migration).toContain("REVOKE netflux_snapshot_maintenance FROM postgres;");
        expect(migration).toContain("REVOKE CREATE ON SCHEMA snapshot_private FROM netflux_snapshot_maintenance;");
        expect(migration).toContain("'reconcile-account-data-snapshots'");
        expect(migration).toContain("'17 * * * *'");
        expect(migration).toContain("'SELECT snapshot_private.reconcile_expired_account_data_snapshots();'");

        const settleExpiredOperation = migration.indexOf("WHERE status = 'building' AND lease_expires_at <= now()");
        const expireSnapshots = migration.indexOf("DELETE FROM snapshot_private.account_data_snapshots");
        const pruneOperations = migration.indexOf("DELETE FROM snapshot_private.account_data_snapshot_operations operation");
        expect(settleExpiredOperation).toBeGreaterThan(-1);
        expect(expireSnapshots).toBeGreaterThan(settleExpiredOperation);
        expect(pruneOperations).toBeGreaterThan(expireSnapshots);

        const grantRole = migration.indexOf("GRANT netflux_snapshot_maintenance TO postgres\n    WITH INHERIT FALSE;");
        const transferOwnership = migration.indexOf("OWNER TO netflux_snapshot_maintenance;");
        const revokeRole = migration.indexOf("REVOKE netflux_snapshot_maintenance FROM postgres;");
        expect(grantRole).toBeLessThan(transferOwnership);
        expect(revokeRole).toBeGreaterThan(transferOwnership);
    });

    it("shares the existing per-account lock and serializes native runs", () => {
        expect(migration).toContain("pg_try_advisory_xact_lock(91_007, 91_009)");
        expect(migration).toContain("'account-data:' || expired_operation.account_id::text");
        expect(migration).toContain("pg_try_advisory_lock(pg_catalog.hashtext(account_lock_key))");
        expect(migration).toContain("pg_advisory_unlock(pg_catalog.hashtext(account_lock_key))");
    });
});
