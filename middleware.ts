import { type NextRequest, NextResponse } from "next/server";
import { proxy } from "./proxy";

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

    // Fallback headers used by other platforms / reverse proxies
    return (
        request.headers.get("x-real-ip") ??
        request.ip ??
        "unknown"
    );
}

function isAdminPath(pathname: string): boolean {
    return (
        pathname === "/admin-login" ||
        pathname.startsWith("/admin-login/") ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/api/admin")
    );
}

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // ── Admin IP gate ────────────────────────────────────────────────
    if (isAdminPath(pathname)) {
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

    // ── Existing proxy logic (session refresh, admin RBAC, redirects) ─
    return proxy(request);
}

export { config } from "./proxy";
