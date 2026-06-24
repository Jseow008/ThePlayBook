import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("service-only analytics RLS remediation", () => {
    const migration = readFileSync(
        join(process.cwd(), "supabase/migrations/20260624093402_document_service_only_analytics_rls.sql"),
        "utf8",
    );
    const driftCheck = readFileSync(
        join(process.cwd(), "scripts/security-analytics-rls-check.sql"),
        "utf8",
    );
    const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    const serviceOnlyTables = [
        "content_reading_activity",
        "content_reader_daily",
        "content_reader_visitor_daily",
        "segment_embedding_gemini",
    ];

    it("documents service-only analytics and embedding tables", () => {
        for (const table of serviceOnlyTables) {
            expect(migration).toContain(`COMMENT ON TABLE public.${table}`);
            expect(driftCheck).toContain(table);
        }

        expect(migration).toContain("Service-only content analytics aggregate table");
        expect(migration).toContain("Service-only per-user content reader dedupe table");
        expect(migration).toContain("Service-only anonymous visitor content reader dedupe table");
        expect(migration).toContain("Service-only Gemini segment embedding table");
        expect(driftCheck).toContain("missing_service_only_table_comment");
    });

    it("revokes public-facing direct table privileges and preserves service-role access", () => {
        for (const table of serviceOnlyTables) {
            expect(migration).toContain(`REVOKE ALL ON TABLE public.${table}`);
            expect(migration).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table}`);
        }

        expect(migration).toContain("FROM PUBLIC, anon, authenticated");
        expect(migration).toContain("TO service_role");
        expect(driftCheck).toContain("public_client_table_privilege");
        expect(driftCheck).toContain("service_role_missing_table_privilege");
    });

    it("adds explicit deny-all policies and a generic policyless-RLS sentinel", () => {
        expect(migration).toContain('"Service-only analytics table: deny public access"');
        expect(migration).toContain('"Service-only embedding table: deny public access"');
        expect(migration).toContain("FOR ALL");
        expect(migration).toContain("TO anon, authenticated");
        expect(migration).toContain("USING (false)");
        expect(migration).toContain("WITH CHECK (false)");
        expect(driftCheck).toContain("missing_deny_all_policy");
        expect(driftCheck).toContain("public_rls_enabled_table_without_policy");
        expect(driftCheck).toContain("HAVING count(policy.policyname) = 0");
    });

    it("keeps activity logging RPCs service-only and fixed-search-path", () => {
        expect(driftCheck).toContain("increment_reading_activity_for_user");
        expect(driftCheck).toContain("log_anonymous_reading_activity");
        expect(driftCheck).toContain("log_reading_activity_for_user");
        expect(driftCheck).toContain("activity_rpc_executable_by_anon");
        expect(driftCheck).toContain("activity_rpc_executable_by_authenticated");
        expect(driftCheck).toContain("activity_rpc_not_executable_by_service_role");
        expect(driftCheck).toContain("activity_rpc_missing_fixed_search_path");
    });

    it("exposes the analytics RLS drift check as an npm script", () => {
        expect(packageJson.scripts?.["security:analytics-rls"]).toBe(
            "node scripts/check-supabase-analytics-rls.mjs",
        );
    });
});
