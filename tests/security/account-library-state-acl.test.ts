import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("account library state ACL repair", () => {
    const migration = readFileSync(
        join(process.cwd(), "supabase/migrations/20260918135420_repair_account_library_state_acl.sql"),
        "utf8",
    );
    const accessGate = readFileSync(
        join(process.cwd(), "scripts/security-new-object-access-check.sql"),
        "utf8",
    );

    it("revokes direct and inherited browser grants without removing worker access", () => {
        expect(migration).toContain(
            "REVOKE ALL PRIVILEGES ON TABLE public.account_library_state FROM PUBLIC;",
        );
        expect(migration).toContain(
            "REVOKE ALL PRIVILEGES ON TABLE public.account_library_state FROM anon;",
        );
        expect(migration).toContain(
            "REVOKE ALL PRIVILEGES ON TABLE public.account_library_state FROM authenticated;",
        );
        expect(migration).toContain(
            "GRANT SELECT, INSERT, UPDATE ON TABLE public.account_library_state",
        );
        expect(migration).toContain("TO netflux_snapshot_worker;");
    });

    it("keeps effective browser access and raw PUBLIC grants in the regression gate", () => {
        expect(accessGate).toContain("account_library_state_browser_access");
        expect(accessGate).toContain("account_library_state_public_grant");
        expect(accessGate).toContain("pg_catalog.has_table_privilege(");
        expect(accessGate).toContain("grant_entry.grantee = 0");
    });
});
