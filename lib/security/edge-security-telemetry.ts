import type { NextRequest } from "next/server";

type EdgeAdminAuthFailureReason =
    | "admin_ips_unconfigured"
    | "ip_not_allowed"
    | "missing_user"
    | "not_admin";

export function recordEdgeAdminAuthFailure(params: {
    request: NextRequest;
    reason: EdgeAdminAuthFailureReason;
    route?: string;
    userId?: string;
}) {
    console.warn("[security]", {
        source: "security",
        runtime: "edge",
        security_signal: "admin_auth_failure",
        category: "admin",
        route: params.route ?? params.request.nextUrl.pathname,
        method: params.request.method,
        user_id: params.userId,
        auth_state: params.userId ? "authenticated" : "anonymous",
        reason: params.reason,
    });
}
