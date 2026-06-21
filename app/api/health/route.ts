import { NextResponse } from "next/server";
import { getRuntimeReadiness } from "@/lib/server/health";

const DB_CHECK_CACHE_TTL_MS = 10_000;
const DB_CHECK_TIMEOUT_MS = 2_500;
const DB_CHECK_FAILED_ISSUE = "Database connectivity check failed.";
const DB_CHECK_TIMEOUT_ISSUE = "Database connectivity check timed out.";

type DatabaseStatus = "reachable" | "unreachable";
type DatabaseCheckResult = Omit<CachedDatabaseCheck, "checkedAt">;
type CachedDatabaseCheck = {
    checkedAt: number;
    database: DatabaseStatus;
    issue: string | null;
};
type DatabaseProbeResponse = {
    error: unknown;
};
type AbortableDatabaseQuery = PromiseLike<DatabaseProbeResponse> & {
    abortSignal?: (signal: AbortSignal) => PromiseLike<DatabaseProbeResponse>;
};

let cachedDatabaseCheck: CachedDatabaseCheck | null = null;
let activeDatabaseCheckPromise: Promise<DatabaseCheckResult> | null = null;

function getBearerToken(value: string | null) {
    if (!value) return null;

    const [scheme, token] = value.split(/\s+/, 2);
    return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function isDetailedHealthAuthorized(request: Request) {
    const configuredSecret = process.env.HEALTH_CHECK_SECRET?.trim();
    if (!configuredSecret) return false;

    const suppliedHeaderSecret = request.headers.get("x-health-check-secret");
    const suppliedBearerSecret = getBearerToken(request.headers.get("authorization"));

    return suppliedHeaderSecret === configuredSecret || suppliedBearerSecret === configuredSecret;
}

function applyAbortSignal(
    query: PromiseLike<DatabaseProbeResponse>,
    signal: AbortSignal
): PromiseLike<DatabaseProbeResponse> {
    const abortableQuery = query as AbortableDatabaseQuery;
    return typeof abortableQuery.abortSignal === "function"
        ? abortableQuery.abortSignal(signal)
        : query;
}

async function runDatabaseProbe(): Promise<DatabaseCheckResult> {
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            abortController.abort();
            reject(new Error(DB_CHECK_TIMEOUT_ISSUE));
        }, DB_CHECK_TIMEOUT_MS);
    });

    try {
        const { createPublicServerClient } = await import("@/lib/supabase/public-server");
        const supabase = createPublicServerClient();
        const query = supabase
            .from("content_item")
            .select("id")
            .limit(1);
        const { error } = await Promise.race([
            applyAbortSignal(query, abortController.signal),
            timeoutPromise,
        ]);

        return error
            ? { database: "unreachable", issue: DB_CHECK_FAILED_ISSUE }
            : { database: "reachable", issue: null };
    } catch (error) {
        return error instanceof Error && error.message === DB_CHECK_TIMEOUT_ISSUE
            ? { database: "unreachable", issue: DB_CHECK_TIMEOUT_ISSUE }
            : { database: "unreachable", issue: DB_CHECK_FAILED_ISSUE };
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

async function checkDatabaseConnectivity(): Promise<DatabaseCheckResult> {
    const now = Date.now();

    if (cachedDatabaseCheck && now - cachedDatabaseCheck.checkedAt < DB_CHECK_CACHE_TTL_MS) {
        return {
            database: cachedDatabaseCheck.database,
            issue: cachedDatabaseCheck.issue,
        };
    }

    if (activeDatabaseCheckPromise) {
        return activeDatabaseCheckPromise;
    }

    activeDatabaseCheckPromise = (async () => {
        const result = await runDatabaseProbe();
        cachedDatabaseCheck = {
            checkedAt: Date.now(),
            ...result,
        };
        return result;
    })();

    try {
        return await activeDatabaseCheckPromise;
    } finally {
        activeDatabaseCheckPromise = null;
    }
}

export function resetHealthCheckCacheForTests() {
    cachedDatabaseCheck = null;
    activeDatabaseCheckPromise = null;
}

export async function GET(request: Request) {
    const timestamp = new Date().toISOString();
    const isDetailedHealthCheck = isDetailedHealthAuthorized(request);

    if (!isDetailedHealthCheck) {
        return NextResponse.json({
            status: "ok",
            timestamp,
        });
    }

    const readiness = getRuntimeReadiness();
    let database: DatabaseStatus = "unreachable";
    const issues = [...readiness.issues];

    if (readiness.checks.supabase_public === "ready") {
        const databaseCheck = await checkDatabaseConnectivity();
        database = databaseCheck.database;
        if (databaseCheck.issue) issues.push(databaseCheck.issue);
    } else {
        issues.push("Database connectivity check skipped because Supabase public configuration is incomplete.");
    }

    const isHealthy = database === "reachable" && readiness.status === "ready";
    const baseBody = {
        status: isHealthy ? "ok" : "degraded",
        timestamp,
    };

    return NextResponse.json(
        {
            ...baseBody,
            environment: readiness.environment,
            database,
            readiness: readiness.checks,
            issues,
        },
        { status: isHealthy ? 200 : 503 }
    );
}
