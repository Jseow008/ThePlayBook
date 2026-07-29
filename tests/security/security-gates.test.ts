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
    const productionHealthScript = readFileSync(
        join(process.cwd(), "scripts/check-supabase-production-health.mjs"),
        "utf8",
    );
    const emailRpcMigration = readFileSync(
        join(process.cwd(), "supabase/migrations/20260722124111_restrict_public_email_rpcs.sql"),
        "utf8",
    );
    const emailRpcWrapper = readFileSync(
        join(process.cwd(), "lib/server/email-subscription-rpcs.ts"),
        "utf8",
    );
    const emailRouteSources = [
        "app/api/email-subscriptions/route.ts",
        "app/api/email-subscriptions/unsubscribe/route.ts",
        "app/api/notification-preferences/request-published/unsubscribe/route.ts",
    ].map((path) => readFileSync(join(process.cwd(), path), "utf8"));

    it("adds explicit npm security scripts", () => {
        expect(packageJson.scripts?.["security:audit"]).toBe(
            "npm audit --omit=dev --audit-level=high",
        );
        expect(packageJson.scripts?.["security:supabase-advisors"]).toBe(
            "node scripts/check-supabase-security-advisors.mjs",
        );
        expect(packageJson.scripts?.["monitor:supabase-performance-advisors"]).toBe(
            "node scripts/check-supabase-security-advisors.mjs --performance",
        );
        expect(packageJson.scripts?.["monitor:supabase-production-health"]).toBe(
            "node scripts/check-supabase-production-health.mjs",
        );
        expect(packageJson.scripts?.["security:admin-rpc-acls"]).toBe(
            "node scripts/check-supabase-admin-rpc-acls.mjs",
        );
        expect(packageJson.scripts?.["verify:production"]).toBe(
            "node scripts/verify-production.mjs",
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
        expect(workflow).toContain("npm run security:admin-rpc-acls");
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

    it("adds a manual production verification job with browser smoke coverage", () => {
        expect(workflow).toContain("production-verification");
        expect(workflow).toContain("inputs.base_url");
        expect(workflow).toContain("npm run verify:production -- --base-url");
        expect(workflow).toContain("SMOKE_ADMIN_EMAIL");
        expect(workflow).toContain("SMOKE_ADMIN_PASSWORD");
        expect(workflow).toContain("SMOKE_READ_PATH");
        expect(workflow).toContain("npx playwright install --with-deps chromium");
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

    it("runs fail-closed scheduled production health and advisor monitoring", () => {
        expect(workflow).toContain("supabase-production-monitoring");
        expect(workflow).toContain("github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'");
        expect(workflow).toContain("Require production monitoring configuration");
        expect(workflow).not.toContain("Skip advisor audit without credentials");
        expect(workflow).toContain("npm run monitor:supabase-production-health");
        expect(workflow).toContain("npm run security:supabase-advisors");
        expect(workflow).toContain("npm run monitor:supabase-performance-advisors");
        expect(advisorScript).toContain("https://api.supabase.com/v1/projects/");
        expect(advisorScript).toContain('process.argv.includes("--performance")');
        expect(advisorScript).toContain("SUPABASE_ACCESS_TOKEN");
        expect(advisorScript).toContain("SUPABASE_PROJECT_REF");
        expect(advisorScript).toContain('level === "ERROR" || level === "WARN"');
        expect(productionHealthScript).toContain("/database/query/read-only");
        expect(productionHealthScript).toContain("/analytics/endpoints/logs");
        expect(productionHealthScript).toContain("extensions.pg_stat_statements");
        expect(productionHealthScript).not.toContain("event_message");
        expect(advisorAllowlist).not.toContain("subscribe_email_subscription");
        expect(advisorAllowlist).not.toContain("unsubscribe_email_subscription_by_token");
        expect(advisorAllowlist).not.toContain("unsubscribe_request_published_notifications_by_token");
        expect(advisorAllowlist).not.toContain("auth_leaked_password_protection");
    });

    it("keeps public email RPCs behind server-side rate limits and telemetry", () => {
        expect(emailRpcMigration).toContain("FROM PUBLIC, anon, authenticated");
        expect(emailRpcMigration.match(/TO service_role/g)).toHaveLength(3);
        expect(emailRpcWrapper).toContain('import { getAdminClient } from "@/lib/supabase/admin"');
        expect(emailRpcWrapper).toContain('getAdminClient().rpc("subscribe_email_subscription"');
        expect(emailRpcWrapper).toContain('getAdminClient().rpc("unsubscribe_email_subscription_by_token"');
        expect(emailRpcWrapper).toContain('"unsubscribe_request_published_notifications_by_token"');

        for (const routeSource of emailRouteSources) {
            expect(routeSource).toContain("@/lib/server/email-subscription-rpcs");
            expect(routeSource).not.toContain("@/lib/supabase/public-server");
            expect(routeSource).not.toContain("@/lib/supabase/admin");
        }
    });
});
