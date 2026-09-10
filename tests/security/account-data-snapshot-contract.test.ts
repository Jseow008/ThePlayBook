import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260910042859_phase1_library_access.sql"),
    "utf8",
);
const snapshotService = readFileSync(
    join(process.cwd(), "lib/server/account-data-snapshots.ts"),
    "utf8",
);

describe("Phase 1 #7 account-data snapshot security contract", () => {
    it("keeps snapshot payloads outside the Data API and fail closed", () => {
        expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS private");
        expect(migration).toContain("FORCE ROW LEVEL SECURITY");
        expect(migration).toContain("REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated");
        expect(migration).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated");
        expect(migration).not.toMatch(/CREATE POLICY[^;]+ON private\.account_data_snapshot/);
    });

    it("makes snapshot completion bounded and integrity-verifiable", () => {
        expect(snapshotService).toContain("ORDER BY ul.library_updated_at DESC, ul.content_id ASC");
        expect(migration).toContain("private.account_data_snapshot_operations");
        expect(migration).toContain("UNIQUE (account_id, idempotency_key)");
        expect(migration).toContain("payload_bytes bigint NOT NULL DEFAULT 0");
        expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions");
        expect(snapshotService).toContain("LIBRARY_SNAPSHOT_MAX_ACCOUNT_BYTES");
        expect(snapshotService).toContain("cleanupExpiredSnapshots");
    });
});
