import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("highlight overlap guard migration", () => {
    const migration = readFileSync(
        join(
            process.cwd(),
            "supabase/migrations/20260729145955_prevent_overlapping_user_highlights.sql"
        ),
        "utf8"
    );

    it("serializes and rejects new overlapping anchored ranges", () => {
        expect(migration).toContain("pg_advisory_xact_lock");
        expect(migration).toContain("existing.anchor_start < NEW.anchor_end");
        expect(migration).toContain("existing.anchor_end > NEW.anchor_start");
        expect(migration).toContain("ERRCODE = '23P01'");
        expect(migration).toContain("BEFORE INSERT OR UPDATE OF");
    });

    it("keeps legacy and unanchored highlights intact", () => {
        expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.user_highlights/i);
        expect(migration).toContain("NEW.anchor_start IS NULL");
        expect(migration).toContain("NEW.anchor_end IS NULL");
    });

    it("does not expose the trigger function as a callable API", () => {
        expect(migration).toContain(
            "REVOKE ALL ON FUNCTION public.prevent_overlapping_user_highlights() FROM PUBLIC"
        );
        expect(migration).toContain(
            "REVOKE ALL ON FUNCTION public.prevent_overlapping_user_highlights() FROM authenticated"
        );
    });
});
