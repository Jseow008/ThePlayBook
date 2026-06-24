import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("security gate CI configuration", () => {
    const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const workflow = readFileSync(
        join(process.cwd(), ".github/workflows/security.yml"),
        "utf8",
    );
    const gitleaksConfig = readFileSync(
        join(process.cwd(), ".gitleaks.toml"),
        "utf8",
    );
    const sqlRunner = readFileSync(
        join(process.cwd(), "scripts/run-supabase-sql-check.mjs"),
        "utf8",
    );
    const advisorScript = readFileSync(
        join(process.cwd(), "scripts/check-supabase-security-advisors.mjs"),
        "utf8",
    );
    const advisorAllowlist = readFileSync(
        join(process.cwd(), "scripts/supabase-security-advisor-allowlist.json"),
        "utf8",
    );

    it("adds explicit npm security scripts", () => {
        expect(packageJson.scripts?.["security:audit"]).toBe(
            "npm audit --omit=dev --audit-level=high",
        );
        expect(packageJson.scripts?.["security:supabase-advisors"]).toBe(
            "node scripts/check-supabase-security-advisors.mjs",
        );
        expect(packageJson.scripts?.["test:security"]).toBe(
            "vitest run tests/proxy.test.ts tests/security/ tests/api/health.test.ts tests/api/activity-log.test.ts tests/api/admin-*.test.ts",
        );
    });

    it("runs PR SQL drift checks against local Supabase, not production", () => {
        expect(workflow).toContain("SUPABASE_LOCAL: \"1\"");
        expect(workflow).toContain("npx supabase start");
        expect(workflow).toContain("npx supabase db reset");
        expect(workflow).toContain("npm run security:function-acls");
        expect(workflow).toContain("npm run security:embedding-table-reads");
        expect(workflow).toContain("npm run security:storage-bucket-listing");
        expect(workflow).toContain("npm run security:analytics-rls");
        expect(sqlRunner).toContain("process.env.SUPABASE_LOCAL");
        expect(sqlRunner).toContain('args.push("--local")');
        expect(sqlRunner).toContain('args.push("--linked")');
    });

    it("runs dependency, secret, env, and route authorization gates", () => {
        expect(workflow).toContain("gitleaks/gitleaks-action@v2");
        expect(workflow).toContain("npm run security:audit");
        expect(workflow).toContain("npm run validate:launch-env");
        expect(workflow).toContain("npm run test:security");
        expect(workflow).toContain("fetch-depth: 0");
    });

    it("keeps generated cache exclusions narrow for secret scanning", () => {
        expect(gitleaksConfig).toContain(".npm-cache-temp");
        expect(gitleaksConfig).toContain("test-results");
        expect(gitleaksConfig).toContain("playwright-report");
        expect(gitleaksConfig).toContain(".next");
        expect(gitleaksConfig).toContain("node_modules");
        expect(gitleaksConfig).not.toContain("scripts/.*");
        expect(gitleaksConfig).not.toContain("docs/.*");
    });

    it("treats Supabase advisors as scheduled/manual audit with exact allowlists", () => {
        expect(workflow).toContain("supabase-advisor-audit");
        expect(workflow).toContain("github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'");
        expect(workflow).toContain("npm run security:supabase-advisors");
        expect(advisorScript).toContain("https://api.supabase.com/v1/projects/");
        expect(advisorScript).toContain("SUPABASE_ACCESS_TOKEN");
        expect(advisorScript).toContain("SUPABASE_PROJECT_REF");
        expect(advisorScript).toContain('level === "ERROR" || level === "WARN"');
        expect(advisorAllowlist).toContain("subscribe_email_subscription");
        expect(advisorAllowlist).toContain("unsubscribe_email_subscription_by_token");
        expect(advisorAllowlist).toContain("unsubscribe_request_published_notifications_by_token");
        expect(advisorAllowlist).not.toContain("auth_leaked_password_protection");
    });
});
