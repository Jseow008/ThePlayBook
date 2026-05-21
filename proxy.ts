import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { buildCanonicalReadPath, getLegacyReadIdFromPathname } from "@/lib/content-paths";

async function getLegacyReadRedirect(request: NextRequest) {
    const contentId = getLegacyReadIdFromPathname(request.nextUrl.pathname);
    if (!contentId) {
        return null;
    }

    const supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        }
    );

    const { data, error } = await supabase
        .from("content_item")
        .select("id, title")
        .eq("id", contentId)
        .eq("status", "verified")
        .is("deleted_at", null)
        .maybeSingle();

    if (error || !data) {
        return null;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = buildCanonicalReadPath(data.id, data.title);

    return NextResponse.redirect(redirectUrl, 308);
}

/**
 * Trusted IPs that may access /admin* and /api/admin* routes.
 *
 * Set ADMIN_ALLOWED_IPS in your environment (Vercel / .env.local) as a
 * comma-separated list of IPv4 or IPv6 addresses.
 *
 * Examples:
 *   ADMIN_ALLOWED_IPS=203.0.113.42
 *   ADMIN_ALLOWED_IPS=203.0.113.42,198.51.100.7,2001:db8::1
 *
 * When the variable is **unset or empty** the IP gate is disabled so that
 * local development is never accidentally locked out.
 */
function getAdminAllowedIps(): Set<string> | null {
    const raw = process.env.ADMIN_ALLOWED_IPS;
    if (!raw || raw.trim() === "") {
        return null; // Gate disabled — allow all (local dev / not configured)
    }

    return new Set(
        raw
            .split(",")
            .map((ip) => ip.trim())
            .filter(Boolean)
    );
}

function getClientIp(request: NextRequest): string {
    // Vercel populates x-forwarded-for; the leftmost entry is the real client.
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    return request.headers.get("x-real-ip") ?? "unknown";
}

function isAdminPath(pathname: string): boolean {
    return (
        pathname === "/admin-login" ||
        pathname.startsWith("/admin-login/") ||
        pathname === "/admin" ||
        pathname.startsWith("/admin/") ||
        pathname.startsWith("/api/admin")
    );
}

function isProtectedAdminPath(pathname: string): boolean {
    return (
        pathname === "/admin" ||
        pathname.startsWith("/admin/") ||
        pathname.startsWith("/api/admin")
    );
}

function isCronProcessorPath(pathname: string): boolean {
    return pathname === "/api/admin/narration/process"
        || pathname === "/api/admin/request-notifications/process";
}

function hasValidCronSecret(request: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || !isCronProcessorPath(request.nextUrl.pathname)) {
        return false;
    }

    return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const isAdminApiRoute = pathname.startsWith("/api/admin");
    const isAuthorizedCronProcessor = hasValidCronSecret(request);

    // ── Admin IP gate ────────────────────────────────────────────────
    if (isAdminPath(pathname) && !isAuthorizedCronProcessor) {
        const allowedIps = getAdminAllowedIps();

        if (allowedIps !== null) {
            const clientIp = getClientIp(request);

            if (!allowedIps.has(clientIp)) {
                // Return a generic 404 so attackers can't even confirm
                // the admin panel exists.
                return new NextResponse("Not Found", { status: 404 });
            }
        }
    }

    const legacyReadRedirect = await getLegacyReadRedirect(request);
    if (legacyReadRedirect) {
        return legacyReadRedirect;
    }

    if (pathname.startsWith("/read")) {
        return NextResponse.next({ request });
    }

    if (isAuthorizedCronProcessor) {
        return NextResponse.next({ request });
    }

    const supabaseResponse = await updateSession(request);

    if (isProtectedAdminPath(pathname)) {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll() { },
                },
            }
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            if (isAdminApiRoute) {
                return NextResponse.json(
                    { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
                    { status: 401 }
                );
            }
            return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url));
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (!profile || profile.role !== "admin") {
            if (isAdminApiRoute) {
                return NextResponse.json(
                    { error: { code: "FORBIDDEN", message: "Admin access required" } },
                    { status: 403 }
                );
            }
            return NextResponse.redirect(new URL("/", request.url));
        }
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        "/read/:path*",
        "/notes",
        "/ask",
        "/admin-login",
        "/admin/:path*",
        "/api/admin/:path*",
        "/profile",
        "/settings",
    ],
};
