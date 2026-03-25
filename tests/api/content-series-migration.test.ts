import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("content series migration", () => {
    it("creates the content_series table and Matthew backfill", () => {
        const migration = readFileSync(
            join(process.cwd(), "supabase/migrations/20260319150000_add_content_series.sql"),
            "utf8"
        );

        expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.content_series");
        expect(migration).toContain("ADD COLUMN IF NOT EXISTS series_id UUID");
        expect(migration).toContain("ADD COLUMN IF NOT EXISTS series_order INTEGER");
        expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_content_item_series_order_unique");
        expect(migration).toContain("'matthew'");
        expect(migration).toContain("Matthew 5-7: Sermon on the Mount");
        expect(migration).toContain("Matthew 26-28: Death, Resurrection, and the Great Commission");
    });
});
