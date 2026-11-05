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
const restriction = readFileSync(
    join(process.cwd(), "supabase/migrations/20261105094614_restrict_catalog_search_to_server.sql"),
    "utf8",
);
const searchCatalogFunction = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.search_catalog"),
    migration.indexOf("REVOKE ALL ON FUNCTION public.refresh_catalog_search_documents"),
);

describe("catalog search security contract", () => {
    it("keeps the privileged catalog caller behind an explicit server boundary", () => {
        const source = readFileSync(join(process.cwd(), "lib/server/catalog-search.ts"), "utf8");
        expect(source).toContain('import "server-only"');
        expect(source).toContain('import { getAdminClient } from "@/lib/supabase/admin"');
        expect(source).not.toContain("createPublicServerClient");
    });

    it("keeps the projection private and restricts the RPC to the server role", () => {
        expect(migration).toContain("ALTER TABLE public.catalog_search_document ENABLE ROW LEVEL SECURITY");
        expect(migration).toContain("CREATE POLICY catalog_search_document_no_direct_browser_access");
        expect(migration).toContain("REVOKE ALL ON TABLE public.catalog_search_document FROM PUBLIC, anon, authenticated");
        expect(migration).toContain("REVOKE ALL ON FUNCTION public.catalog_search_plain_text(text)");
        expect(migration).toContain("REVOKE ALL ON FUNCTION public.search_catalog");
        expect(restriction).toContain("FROM PUBLIC, anon, authenticated");
        expect(restriction).toContain("TO service_role");
        expect(restriction).toContain("SECURITY DEFINER");
        expect(restriction).toContain("SET search_path = pg_catalog, public");
        expect(restriction).toContain("coalesce(auth.jwt() ->> 'role', '') <> 'service_role'");
    });

    it("uses a fixed search projection rather than exposing arbitrary catalog rows", () => {
        expect(migration).toContain("RETURNS TABLE");
        expect(migration).toContain("catalog_search_document");
        expect(migration).toContain("p_after_rank numeric");
        expect(migration).toContain("cursor_rank text");
        expect(searchCatalogFunction).not.toMatch(/SELECT\s+\*/i);
        expect(searchCatalogFunction).toContain("'input_empty'::text");
    });

    it("removes the public exception and retains the projection and general definer guards", () => {
        expect(aclCheck).toContain("server_catalog_search_definer_functions");
        expect(aclCheck).toContain("server_catalog_search_missing_service_role_execute");
        expect(aclCheck).toContain("server_catalog_search_executable_by_public");
        expect(aclCheck).toContain("server_catalog_search_missing_fixed_projection");
        expect(aclCheck).not.toContain("AND NOT is_server_catalog_search_definer");
        expect(aclCheck).toContain("p_after_rank numeric");
        expect(aclCheck).toContain("definer_rpc_missing_service_role_guard");
        expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.search_user_highlights");
    });

    it("adds only the server-role guard to the existing search implementation", () => {
        const updatedFunction = restriction.slice(
            restriction.indexOf("CREATE OR REPLACE FUNCTION public.search_catalog"),
            restriction.indexOf("REVOKE ALL ON FUNCTION public.search_catalog"),
        );
        const withoutGuard = updatedFunction.replace(
            /    -- Called only by the fixed server-side public catalog adapter\.\n    IF coalesce\(auth\.jwt\(\) ->> 'role', ''\) <> 'service_role' THEN\n        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';\n    END IF;\n\n/,
            "",
        );
        expect(withoutGuard.trim()).toBe(searchCatalogFunction.trim());
    });
});
