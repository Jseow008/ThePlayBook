#!/usr/bin/env node

const DEFAULT_TIMEOUT_MS = 10_000;

function usage() {
    console.log(`Usage: node scripts/check-deployment-health.mjs --url <base-url>

Fetches <base-url>/api/health and exits non-zero unless the response is 200 and the JSON body reports status "ok".

Options:
  --url <base-url>     Base deployment URL to check.
  --timeout <ms>       Request timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}
  -h, --help           Show this help text.
`);
}

function parseArgs(argv) {
    const args = {
        url: "",
        timeoutMs: DEFAULT_TIMEOUT_MS,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === "--url") {
            args.url = argv[++index] ?? "";
            continue;
        }

        if (arg === "--timeout") {
            const rawTimeout = argv[++index] ?? "";
            const parsedTimeout = Number(rawTimeout);
            if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
                throw new Error(`Invalid timeout value: ${rawTimeout}`);
            }
            args.timeoutMs = Math.floor(parsedTimeout);
            continue;
        }

        if (arg === "-h" || arg === "--help") {
            args.help = true;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return args;
}

function normalizeBaseUrl(value) {
    const base = value.trim();
    if (!base) {
        return "";
    }

    const parsed = new URL(base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("URL must use http or https.");
    }

    return parsed.toString().replace(/\/+$/, "");
}

function createTimeoutSignal(timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
        signal: controller.signal,
        clear() {
            clearTimeout(timer);
        },
    };
}

async function main() {
    let args;

    try {
        args = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        usage();
        process.exit(1);
    }

    if (args.help) {
        usage();
        process.exit(0);
    }

    if (!args.url) {
        console.error("Missing required --url argument.");
        usage();
        process.exit(1);
    }

    let baseUrl;
    try {
        baseUrl = normalizeBaseUrl(args.url);
    } catch (error) {
        console.error(`Invalid --url value: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }

    const healthUrl = new URL("/api/health", `${baseUrl}/`).toString();
    const timeout = createTimeoutSignal(args.timeoutMs);

    try {
        const response = await fetch(healthUrl, {
            signal: timeout.signal,
            headers: {
                accept: "application/json",
            },
        });

        const rawBody = await response.text();
        let body = null;

        try {
            body = rawBody ? JSON.parse(rawBody) : null;
        } catch {
            body = null;
        }

        const responseStatusOk = response.status === 200;
        const bodyStatusOk = body && body.status === "ok";

        if (responseStatusOk && bodyStatusOk) {
            console.log(`Deployment health ok: ${healthUrl}`);
            process.exit(0);
        }

        console.error(`Deployment health check failed: ${healthUrl}`);
        console.error(`HTTP status: ${response.status} ${response.statusText}`);

        if (body && typeof body === "object") {
            console.error(`Body status: ${typeof body.status === "string" ? body.status : "unknown"}`);
            if (Array.isArray(body.issues) && body.issues.length > 0) {
                console.error("Issues:");
                for (const issue of body.issues) {
                    console.error(`- ${issue}`);
                }
            }
        } else if (rawBody) {
            console.error("Body:");
            console.error(rawBody);
        }

        process.exit(1);
    } catch (error) {
        console.error(`Deployment health request failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    } finally {
        timeout.clear();
    }
}

main();
