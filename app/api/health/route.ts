import { NextResponse } from "next/server";
import { checkDatabaseConnectivity, type DatabaseStatus } from "@/app/api/health/database-check";
import { getRuntimeReadiness } from "@/lib/server/health";

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
