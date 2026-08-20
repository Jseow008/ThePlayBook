import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("durable story image job migration", () => {
    const migration = readFileSync(
        join(process.cwd(), "supabase/migrations/20260819085034_durable_story_image_jobs.sql"),
        "utf8"
    );

    it("deduplicates content versions and supports retry-safe claiming", () => {
        expect(migration).toContain("UNIQUE (content_id, render_version)");
        expect(migration).toContain("attempts smallint NOT NULL DEFAULT 0");
        expect(migration).toContain("max_attempts smallint NOT NULL DEFAULT 3");
        expect(migration).toContain("story_image_job_ready_queue_idx");
        expect(migration).toContain("story_image_job_stale_processing_idx");
    });

    it("keeps job state server-only", () => {
        expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
        expect(migration).toContain("REVOKE ALL ON TABLE public.story_image_job FROM anon, authenticated");
        expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.story_image_job TO service_role");
        expect(migration).toContain("Service-only story image jobs: deny public access");
        expect(migration).toContain("TO anon, authenticated");
        expect(migration).toContain("USING (false)");
        expect(migration).toContain("WITH CHECK (false)");
    });

    it("constrains immutable JPEG storage paths", () => {
        expect(migration).toContain("story_image_job_storage_path_check");
        expect(migration).toContain("^story-images/");
        expect(migration).toContain("\\.jpg$");
    });
});
