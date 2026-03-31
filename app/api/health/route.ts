import { NextResponse } from "next/server";
import { getRuntimeReadiness } from "@/lib/server/health";

export async function GET() {
    const timestamp = new Date().toISOString();
    const readiness = getRuntimeReadiness();
    let database: "reachable" | "unreachable" = "unreachable";
    const issues = [...readiness.issues];

    if (readiness.checks.supabase_public === "ready") {
        try {
            const { createPublicServerClient } = await import("@/lib/supabase/public-server");
            const supabase = createPublicServerClient();
            const { error } = await supabase
                .from("content_item")
                .select("id")
                .limit(1);

            if (!error) {
                database = "reachable";
            } else {
                issues.push("Database connectivity check failed.");
            }
        } catch {
            issues.push("Database connectivity check failed.");
        }
    } else {
        issues.push("Database connectivity check skipped because Supabase public configuration is incomplete.");
    }

    const isHealthy = database === "reachable" && readiness.status === "ready";

    return NextResponse.json(
        {
            status: isHealthy ? "ok" : "degraded",
            environment: readiness.environment,
            database,
            readiness: readiness.checks,
            issues,
            timestamp,
        },
        { status: isHealthy ? 200 : 503 }
    );
}
