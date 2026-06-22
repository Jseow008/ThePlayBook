import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);

type ScriptResult = {
    code: number;
    stdout: string;
    stderr: string;
};

async function runNodeScript(args: string[], env: NodeJS.ProcessEnv): Promise<ScriptResult> {
    try {
        const result = await execFile(process.execPath, args, {
            cwd: process.cwd(),
            env,
        });

        return {
            code: 0,
            stdout: result.stdout,
            stderr: result.stderr,
        };
    } catch (error: any) {
        return {
            code: Number(error.code ?? 1),
            stdout: String(error.stdout ?? ""),
            stderr: String(error.stderr ?? ""),
        };
    }
}

function createBaseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        ...overrides,
    };
}

function createHealthServer(
    statusCode: number,
    payload: unknown,
    onRequest?: (request: http.IncomingMessage) => void
) {
    return new Promise<{ server: http.Server; url: string }>((resolve) => {
        const server = http.createServer((request, response) => {
            if (request.url !== "/api/health") {
                response.writeHead(404, { "content-type": "text/plain" });
                response.end("not found");
                return;
            }

            onRequest?.(request);
            response.writeHead(statusCode, { "content-type": "application/json" });
            response.end(JSON.stringify(payload));
        });

        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            resolve({ server, url: `http://127.0.0.1:${port}` });
        });
    });
}

describe("launch validation scripts", () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("fails env validation when required variables are missing", async () => {
        const result = await runNodeScript(
            ["scripts/validate-launch-env.mjs", "--env-file", "/dev/null"],
            createBaseEnv()
        );

        expect(result.code).toBe(1);
        expect(result.stdout).toContain("Status: failed");
        expect(result.stdout).toContain("Missing required env var: AI_PROVIDER");
        expect(result.stdout).toContain("Missing required env var: NEXT_PUBLIC_SENTRY_DSN");
    });

    it("passes env validation when all required values are supplied via an explicit env file", async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), "netflux-launch-env-"));
        tempDirs.push(tempDir);

        const envFile = path.join(tempDir, "launch.env");
        writeFileSync(envFile, [
            "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key",
            "SUPABASE_SERVICE_KEY=test-service-key",
            "NEXT_PUBLIC_SITE_URL=https://netflux.example",
            "NEXT_PUBLIC_APP_URL=https://app.netflux.example",
            "AI_PROVIDER=anthropic",
            "AI_MODEL=test-model",
            "ANTHROPIC_API_KEY=test-anthropic",
            "GEMINI_API_KEY=test-gemini",
            "UPSTASH_REDIS_REST_URL=https://upstash.example",
            "UPSTASH_REDIS_REST_TOKEN=test-upstash",
            "NEXT_PUBLIC_SENTRY_DSN=https://public@example.ingest.sentry.io/123",
            "HEALTH_CHECK_SECRET=test-health-secret",
            "ADMIN_ALLOWED_IPS=203.0.113.42,2001:db8::1",
            "ANONYMOUS_ACTIVITY_SECRET=test-anonymous-activity-secret",
        ].join("\n"));

        const result = await runNodeScript(
            ["scripts/validate-launch-env.mjs", "--env-file", envFile],
            createBaseEnv()
        );

        expect(result.code).toBe(0);
        expect(result.stdout).toContain("Status: ok");
    });

    it("fails env validation when production admin access control is missing", async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), "netflux-launch-env-"));
        tempDirs.push(tempDir);

        const envFile = path.join(tempDir, "launch.env");
        writeFileSync(envFile, [
            "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key",
            "SUPABASE_SERVICE_KEY=test-service-key",
            "NEXT_PUBLIC_SITE_URL=https://netflux.example",
            "AI_PROVIDER=anthropic",
            "AI_MODEL=test-model",
            "ANTHROPIC_API_KEY=test-anthropic",
            "GEMINI_API_KEY=test-gemini",
            "UPSTASH_REDIS_REST_URL=https://upstash.example",
            "UPSTASH_REDIS_REST_TOKEN=test-upstash",
            "NEXT_PUBLIC_SENTRY_DSN=https://public@example.ingest.sentry.io/123",
            "HEALTH_CHECK_SECRET=test-health-secret",
            "ANONYMOUS_ACTIVITY_SECRET=test-anonymous-activity-secret",
        ].join("\n"));

        const result = await runNodeScript(
            ["scripts/validate-launch-env.mjs", "--env-file", envFile],
            createBaseEnv()
        );

        expect(result.code).toBe(1);
        expect(result.stdout).toContain("Status: failed");
        expect(result.stdout).toContain("Missing required env var: ADMIN_ALLOWED_IPS");
    });

    it("fails env validation when ADMIN_ALLOWED_IPS is malformed", async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), "netflux-launch-env-"));
        tempDirs.push(tempDir);

        const envFile = path.join(tempDir, "launch.env");
        writeFileSync(envFile, [
            "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key",
            "SUPABASE_SERVICE_KEY=test-service-key",
            "NEXT_PUBLIC_SITE_URL=https://netflux.example",
            "AI_PROVIDER=anthropic",
            "AI_MODEL=test-model",
            "ANTHROPIC_API_KEY=test-anthropic",
            "GEMINI_API_KEY=test-gemini",
            "UPSTASH_REDIS_REST_URL=https://upstash.example",
            "UPSTASH_REDIS_REST_TOKEN=test-upstash",
            "NEXT_PUBLIC_SENTRY_DSN=https://public@example.ingest.sentry.io/123",
            "HEALTH_CHECK_SECRET=test-health-secret",
            "ADMIN_ALLOWED_IPS=203.0.113.42,,not-an-ip",
            "ANONYMOUS_ACTIVITY_SECRET=test-anonymous-activity-secret",
        ].join("\n"));

        const result = await runNodeScript(
            ["scripts/validate-launch-env.mjs", "--env-file", envFile],
            createBaseEnv()
        );

        expect(result.code).toBe(1);
        expect(result.stdout).toContain("Status: failed");
        expect(result.stdout).toContain("ADMIN_ALLOWED_IPS contains an empty entry");
        expect(result.stdout).toContain("Invalid IP address in ADMIN_ALLOWED_IPS: not-an-ip");
    });

    it("passes deployment health when the endpoint returns ok", async () => {
        let authorizationHeader = "";
        const { server, url } = await createHealthServer(200, { status: "ok", issues: [] }, (request) => {
            authorizationHeader = request.headers.authorization ?? "";
        });

        try {
            const result = await runNodeScript(
                ["scripts/check-deployment-health.mjs", "--url", url],
                createBaseEnv({ HEALTH_CHECK_SECRET: "health-secret" })
            );

            expect(result.code).toBe(0);
            expect(result.stdout).toContain("Deployment health ok");
            expect(authorizationHeader).toBe("Bearer health-secret");
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });

    it("fails deployment health when the endpoint returns degraded status", async () => {
        const { server, url } = await createHealthServer(503, {
            status: "degraded",
            issues: ["Database connection failed."],
        });

        try {
            const result = await runNodeScript(
                ["scripts/check-deployment-health.mjs", "--url", url],
                createBaseEnv()
            );

            expect(result.code).toBe(1);
            expect(result.stderr).toContain("Deployment health check failed");
            expect(result.stderr).toContain("Body status: degraded");
            expect(result.stderr).toContain("Database connection failed.");
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});
