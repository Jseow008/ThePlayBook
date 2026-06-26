import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("admin RPC ACL verification", () => {
    const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const driftCheck = readFileSync(
        join(process.cwd(), "scripts/security-admin-rpc-acl-check.sql"),
        "utf8",
    );
    const wrapper = readFileSync(
        join(process.cwd(), "scripts/check-supabase-admin-rpc-acls.mjs"),
        "utf8",
    );

    it("exposes a dedicated direct SQL check for admin RPC execute privileges", () => {
        expect(packageJson.scripts?.["security:admin-rpc-acls"]).toBe(
            "node scripts/check-supabase-admin-rpc-acls.mjs",
        );
        expect(wrapper).toContain("security-admin-rpc-acl-check.sql");
    });

    it("fails if admin RPCs are executable by public client roles", () => {
        expect(driftCheck).toContain("admin_update_content_graph");
        expect(driftCheck).toContain("admin_finalize_narration_generation");
        expect(driftCheck).toContain("admin_rpc_executable_by_%s");
        expect(driftCheck).toContain("admin_rpc_executable_by_PUBLIC");
        expect(driftCheck).toContain("acl.grantee = 0");
        expect(driftCheck).toContain("'anon'");
        expect(driftCheck).toContain("'authenticated'");
        expect(driftCheck).toContain("has_function_privilege(role_name, oid, 'EXECUTE')");
    });

    it("requires service-role execute on every public admin RPC", () => {
        expect(driftCheck).toContain("p.proname LIKE 'admin\\_%'");
        expect(driftCheck).toContain("admin_rpc_not_executable_by_service_role");
        expect(driftCheck).toContain("has_function_privilege('service_role', oid, 'EXECUTE')");
    });
});
