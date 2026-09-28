const DB_CHECK_CACHE_TTL_MS = 10_000;
const DB_CHECK_TIMEOUT_MS = 2_500;
const DB_CHECK_FAILED_ISSUE = "Database connectivity check failed.";
const DB_CHECK_TIMEOUT_ISSUE = "Database connectivity check timed out.";

export type DatabaseStatus = "reachable" | "unreachable";

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
    const started = performance.now();
    const abortController = new AbortController();
    const failure = (): DatabaseCheckResult => {
        const timedOut = abortController.signal.aborted;
        // Fixed categories only: never log provider errors, URLs, credentials or rows.
        console.warn(JSON.stringify({
            event: "health_database_probe_failed",
            reason: timedOut ? "timeout" : "query_failure",
            duration_ms: Math.round(Math.max(0, performance.now() - started)),
            timeout_ms: DB_CHECK_TIMEOUT_MS,
        }));
        return { database: "unreachable", issue: timedOut ? DB_CHECK_TIMEOUT_ISSUE : DB_CHECK_FAILED_ISSUE };
    };
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

        return error || abortController.signal.aborted
            ? failure()
            : { database: "reachable", issue: null };
    } catch {
        return failure();
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

export async function checkDatabaseConnectivity(): Promise<DatabaseCheckResult> {
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
