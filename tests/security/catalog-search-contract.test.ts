import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260917135104_add_catalog_search_contract.sql"),
    "utf8",
);
const aclCheck = readFileSync(
    join(process.cwd(), "scripts/security-function-acl-check.sql"),
    "utf8",
);
const searchCatalogFunction = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.search_catalog"),
    migration.indexOf("REVOKE ALL ON FUNCTION public.refresh_catalog_search_documents"),
);

describe("catalog search security contract", () => {
    it("keeps the projection private and grants the reviewed RPC only to public application roles", () => {
        expect(migration).toContain("ALTER TABLE public.catalog_search_document ENABLE ROW LEVEL SECURITY");
        expect(migration).toContain("CREATE POLICY catalog_search_document_no_direct_browser_access");
        expect(migration).toContain("REVOKE ALL ON TABLE public.catalog_search_document FROM PUBLIC, anon, authenticated");
        expect(migration).toContain("REVOKE ALL ON FUNCTION public.catalog_search_plain_text(text)");
        expect(migration).toContain("REVOKE ALL ON FUNCTION public.search_catalog");
        expect(migration).toContain("TO anon, authenticated");
        expect(migration).toContain("SECURITY DEFINER");
        expect(migration).toContain("SET search_path = pg_catalog, public");
    });

    it("uses a fixed search projection rather than exposing arbitrary catalog rows", () => {
        expect(migration).toContain("RETURNS TABLE");
        expect(migration).toContain("catalog_search_document");
        expect(migration).toContain("p_after_rank numeric");
        expect(migration).toContain("cursor_rank text");
        expect(searchCatalogFunction).not.toMatch(/SELECT\s+\*/i);
        expect(searchCatalogFunction).toContain("'input_empty'::text");
    });

    it("keeps the ACL exception exact and preserves the general definer guard", () => {
        expect(aclCheck).toContain("public_catalog_search_definer_functions");
        expect(aclCheck).toContain("public_catalog_search_missing_anon_execute");
        expect(aclCheck).toContain("public_catalog_search_missing_authenticated_execute");
        expect(aclCheck).toContain("public_catalog_search_executable_by_public");
        expect(aclCheck).toContain("public_catalog_search_missing_fixed_projection");
        expect(aclCheck).toContain("p_after_rank numeric");
        expect(aclCheck).toContain("definer_rpc_missing_service_role_guard");
        expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.search_user_highlights");
    });
});
