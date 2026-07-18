import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("DB-103 RLS policy optimization", () => {
    const migration = readFileSync(
        join(process.cwd(), "supabase/migrations/20260718062617_optimize_rls_policies.sql"),
        "utf8",
    );
    const roleMatrix = readFileSync(
        join(process.cwd(), "scripts/database-rls-policy-check.sql"),
        "utf8",
    );
    const runner = readFileSync(
        join(process.cwd(), "scripts/check-database-rls-policies.mjs"),
        "utf8",
    );
    const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    it("removes redundant bypass-role policies with a fail-closed preflight", () => {
        expect(migration).toContain("AND rolbypassrls");
        expect(migration).toContain("expected exactly 48 public policies");
        expect(migration).toContain('DROP POLICY "Service role has full access to artifact"');
        expect(migration).toContain('DROP POLICY "Service role has full access to content request notifications"');
        expect(migration).toContain("expected exactly 40 public policies");
        expect(migration).toContain('CREATE POLICY "Service-only email subscriptions: deny public access"');
        expect(migration).toContain('CREATE POLICY "Service-only request notifications: deny public access"');
        expect(migration).toContain("left a PUBLIC or service_role policy behind");
    });

    it("scopes public and ownership policies to explicit Data API roles", () => {
        expect(migration).toContain("ON public.content_item TO anon, authenticated");
        expect(migration).toContain("ON public.content_requests TO anon, authenticated");
        expect(migration).toContain("ON public.content_feedback\n    TO authenticated");
        expect(migration).toContain("ON public.user_highlights\n    TO authenticated");
        expect(migration).toContain("ON public.homepage_section\n    TO authenticated");
        expect(roleMatrix).toContain("forbidden_policy_role");
    });

    it("uses init-plan auth checks and explicit UPDATE invariants", () => {
        expect(migration).toContain("(SELECT auth.uid()) = user_id");
        expect(migration).not.toMatch(/USING \(auth\.uid\(\)/);
        expect(migration).not.toMatch(/WITH CHECK \(auth\.uid\(\)/);
        expect(migration).toContain('ALTER POLICY "Users can update their own highlights"');
        expect(migration).toContain("USING ((SELECT auth.uid()) = user_id)\n    WITH CHECK ((SELECT auth.uid()) = user_id)");
        expect(roleMatrix).toContain("unoptimized_auth_uid_policy");
        expect(roleMatrix).toContain("incomplete_update_policy");
    });

    it("protects the admin view and exercises every required role", () => {
        expect(migration).toContain("SET (security_invoker = true)");
        expect(roleMatrix).toContain("SET LOCAL ROLE anon");
        expect(roleMatrix).toContain("SET LOCAL ROLE authenticated");
        expect(roleMatrix).toContain("non-admin cannot update homepage sections");
        expect(roleMatrix).toContain("admin updates homepage sections");
        expect(roleMatrix).toContain("SET LOCAL ROLE service_role");
        expect(roleMatrix).toContain("service role bypasses owner filters");
    });

    it("refuses to run mutation checks against the linked production database", () => {
        expect(runner).toContain("DB103_TEST_DB_URL");
        expect(runner).toContain("Refusing to run the DB-103 role matrix against a linked database");
        expect(packageJson.scripts?.["database:rls-policies"]).toBe(
            "node scripts/check-database-rls-policies.mjs",
        );
    });
});
