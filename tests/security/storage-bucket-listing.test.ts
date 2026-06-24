import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("storage bucket listing remediation", () => {
    const migration = readFileSync(
        join(process.cwd(), "supabase/migrations/20260624090733_restrict_public_bucket_listing.sql"),
        "utf8",
    );
    const driftCheck = readFileSync(
        join(process.cwd(), "scripts/security-storage-bucket-listing-check.sql"),
        "utf8",
    );
    const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    it("drops broad public storage select policies while keeping buckets public", () => {
        expect(migration).toContain("SET public = true");
        expect(migration).toContain("WHERE id IN ('media', 'audio')");
        expect(migration).toContain('DROP POLICY IF EXISTS "Public Access" ON storage.objects');
        expect(migration).toContain('DROP POLICY IF EXISTS "Public audio read" ON storage.objects');
        expect(migration).not.toMatch(/CREATE POLICY\s+"Public Access"/i);
        expect(migration).not.toMatch(/CREATE POLICY\s+"Public audio read"/i);
    });

    it("checks for public listing drift and required admin write policies", () => {
        expect(driftCheck).toContain("forbidden_storage_listing_policy_exists");
        expect(driftCheck).toContain("broad_public_storage_select_policy");
        expect(driftCheck).toContain("storage.allow_only_operation");
        expect(driftCheck).toContain("storage.allow_any_operation");
        expect(driftCheck).toContain("storage_bucket_missing_or_not_public");
        expect(driftCheck).toContain("missing_admin_storage_policy");
        expect(packageJson.scripts?.["security:storage-bucket-listing"]).toBe(
            "node scripts/check-supabase-storage-bucket-listing.mjs",
        );
    });
});
