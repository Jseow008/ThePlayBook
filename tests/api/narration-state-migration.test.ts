import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("narration state consistency migration", () => {
    const migration = readFileSync(
        join(process.cwd(), "supabase/migrations/20260613151451_fix_narration_state_consistency.sql"),
        "utf8"
    );

    it("repairs stale narration rows that have no audio", () => {
        expect(migration).toContain("WHERE narration_status = 'stale'");
        expect(migration).toContain("AND audio_url IS NULL");
        expect(migration).toContain("narration_status = 'idle'");
        expect(migration).toContain("narration_error = NULL");
    });

    it("prevents stale narration without audio", () => {
        expect(migration).toContain("content_item_stale_requires_audio_check");
        expect(migration).toContain("CHECK (narration_status <> 'stale' OR audio_url IS NOT NULL)");
    });

    it("persists narration state fields through the content graph RPC", () => {
        expect(migration).toContain("narration_status = CASE WHEN p_content_patch ? 'narration_status'");
        expect(migration).toContain("narration_error = CASE WHEN p_content_patch ? 'narration_error'");
        expect(migration).toContain("narration_requested_at = CASE");
        expect(migration).toContain("narration_started_at = CASE");
        expect(migration).toContain("narration_completed_at = CASE");
    });
});
