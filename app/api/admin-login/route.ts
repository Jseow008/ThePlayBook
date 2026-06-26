import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { RateLimitBackendUnavailableError, rateLimit } from "@/lib/server/rate-limit";
import { recordAdminAuthFailure, recordSecuritySignal } from "@/lib/server/security-telemetry";

const ADMIN_LOGIN_RATE_LIMIT = {
    limit: 5,
    windowMs: 10 * 60_000,
    key: "admin-login",
} as const;

const adminLoginSchema = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(1024),
});

function adminLoginError(status: number, code: string, message: string) {
    return NextResponse.json(
        {
            error: {
                code,
                message,
            },
        },
        { status }
    );
}

export async function POST(request: NextRequest) {
    let rl;
    try {
        rl = await rateLimit(request, ADMIN_LOGIN_RATE_LIMIT);
    } catch (error) {
        if (!(error instanceof RateLimitBackendUnavailableError)) {
            throw error;
        }

        recordSecuritySignal({
            signal: "admin_auth_failure",
            category: "admin",
            route: "/api/admin-login",
            request,
            authState: "anonymous",
            reason: "admin_login_rate_limit_unavailable",
            retryAfterMs: 60_000,
            metadata: {
                limit: ADMIN_LOGIN_RATE_LIMIT.limit,
                blocked_window: ADMIN_LOGIN_RATE_LIMIT.windowMs,
                reset_after_seconds: 60,
            },
        });

        return NextResponse.json(
            {
                error: {
                    code: "RATE_LIMIT_UNAVAILABLE",
                    message: "Service temporarily unavailable.",
                },
            },
            {
                status: 503,
                headers: {
                    "Retry-After": "60",
                },
            }
        );
    }

    if (!rl.success) {
        recordSecuritySignal({
            signal: "admin_auth_failure",
            category: "admin",
            route: "/api/admin-login",
            request,
            authState: "anonymous",
            reason: "admin_login_rate_limited",
            retryAfterMs: rl.retryAfterMs ?? ADMIN_LOGIN_RATE_LIMIT.windowMs,
            metadata: {
                limit: ADMIN_LOGIN_RATE_LIMIT.limit,
                blocked_window: ADMIN_LOGIN_RATE_LIMIT.windowMs,
                reset_after_seconds: Math.ceil((rl.retryAfterMs ?? ADMIN_LOGIN_RATE_LIMIT.windowMs) / 1000),
            },
        });

        return NextResponse.json(
            {
                error: {
                    code: "RATE_LIMITED",
                    message: "Too many sign-in attempts. Please wait and try again.",
                },
            },
            {
                status: 429,
                headers: {
                    "Retry-After": String(Math.ceil((rl.retryAfterMs ?? ADMIN_LOGIN_RATE_LIMIT.windowMs) / 1000)),
                },
            }
        );
    }

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        recordAdminAuthFailure({
            request,
            route: "/api/admin-login",
            reason: "admin_login_invalid_credentials",
        });
        return adminLoginError(400, "INVALID_LOGIN", "Invalid email or password.");
    }

    const parsed = adminLoginSchema.safeParse(payload);
    if (!parsed.success) {
        recordAdminAuthFailure({
            request,
            route: "/api/admin-login",
            reason: "admin_login_invalid_credentials",
        });
        return adminLoginError(400, "INVALID_LOGIN", "Invalid email or password.");
    }

    try {
        const supabase = await createClient();
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
            email: parsed.data.email,
            password: parsed.data.password,
        });

        if (signInError) {
            recordAdminAuthFailure({
                request,
                route: "/api/admin-login",
                reason: "admin_login_invalid_credentials",
            });
            return adminLoginError(401, "INVALID_LOGIN", "Invalid email or password.");
        }

        if (!data.user) {
            recordAdminAuthFailure({
                request,
                route: "/api/admin-login",
                reason: "admin_login_missing_user",
            });
            return adminLoginError(401, "INVALID_LOGIN", "Invalid email or password.");
        }

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", data.user.id)
            .single<{ role: string }>();

        if (profileError || !profile) {
            await supabase.auth.signOut();
            recordAdminAuthFailure({
                request,
                route: "/api/admin-login",
                reason: "admin_login_missing_profile",
                userId: data.user.id,
            });
            return adminLoginError(403, "ADMIN_ACCESS_REQUIRED", "Admin access required.");
        }

        if (profile.role !== "admin") {
            await supabase.auth.signOut();
            recordAdminAuthFailure({
                request,
                route: "/api/admin-login",
                reason: "admin_login_not_admin",
                userId: data.user.id,
            });
            return adminLoginError(403, "ADMIN_ACCESS_REQUIRED", "Admin access required.");
        }

        return NextResponse.json({ ok: true });
    } catch {
        recordAdminAuthFailure({
            request,
            route: "/api/admin-login",
            reason: "admin_login_error",
        });
        return adminLoginError(500, "LOGIN_FAILED", "Unable to sign in. Please try again.");
    }
}
