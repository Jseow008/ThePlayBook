import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("embedding table read remediation", () => {
    const migration = readFileSync(
        join(process.cwd(), "supabase/migrations/20260622165437_restrict_embedding_table_reads.sql"),
        "utf8",
    );
    const rpcAclMigration = readFileSync(
        join(process.cwd(), "supabase/migrations/20260624083713_lock_down_embedding_rpc_exposure.sql"),
        "utf8",
    );
    const driftCheck = readFileSync(
        join(process.cwd(), "scripts/security-embedding-table-read-check.sql"),
        "utf8",
    );

    it("revokes direct embedding table reads from public client roles", () => {
        expect(migration).toContain("DROP POLICY IF EXISTS \"Enable read access for all users\"");
        expect(migration).toContain("DROP POLICY IF EXISTS \"Enable read access for all users on Gemini segment embeddings\"");
        expect(migration).toContain("REVOKE SELECT ON public.segment_embedding");
        expect(migration).toContain("FROM PUBLIC, anon, authenticated");
        expect(migration).toContain("REVOKE SELECT ON public.segment_embedding_gemini");
        expect(driftCheck).toContain("anon_segment_embedding_select_revoked");
        expect(driftCheck).toContain("authenticated_segment_embedding_gemini_select_revoked");
    });

    it("keeps vector reads behind guarded private security definer helpers", () => {
        expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS private");
        expect(migration).toContain("SECURITY DEFINER");
        expect(migration).toContain("SET search_path = public, extensions");
        expect(migration).toContain("p_user_id IS DISTINCT FROM auth.uid()");
        expect(migration).toContain("ci.status = 'verified'");
        expect(migration).toContain("ci.deleted_at IS NULL");
        expect(migration).toContain("SECURITY INVOKER");
        expect(migration).toContain("FROM private.match_library_segments_internal");
        expect(migration).toContain("FROM private.match_library_segments_gemini_internal");
        expect(driftCheck).toContain("private_helper_missing_user_boundary");
        expect(driftCheck).toContain("private_helper_missing_verified_content_filter");
    });

    it("locks embedding maintenance RPCs to service role while preserving user match RPC access", () => {
        expect(rpcAclMigration).toContain("get_segments_missing_embeddings");
        expect(rpcAclMigration).toContain("get_segments_missing_gemini_embeddings");
        expect(rpcAclMigration).toContain("get_gemini_segment_embedding_coverage");
        expect(rpcAclMigration).toContain("REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated");
        expect(rpcAclMigration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
        expect(rpcAclMigration).toContain("match_library_segments_gemini");
        expect(rpcAclMigration).toContain("GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role");
        expect(rpcAclMigration).toContain("SET search_path = public, extensions");
        expect(driftCheck).toContain("service_only_embedding_rpc_executable_by_anon");
        expect(driftCheck).toContain("service_only_embedding_rpc_executable_by_authenticated");
        expect(driftCheck).toContain("user_match_embedding_rpc_missing_authenticated_execute");
        expect(driftCheck).toContain("embedding_rpc_missing_fixed_search_path");
    });
});
