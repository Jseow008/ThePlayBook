import { NextResponse } from "next/server";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { createClient } from "@/lib/supabase/server";
import { normalizeLoginNextPath } from "@/lib/auth-redirect";

const SIGNUP_COMPLETION_WINDOW_MS = 24 * 60 * 60 * 1000;

function parseOrigin(value: string | undefined) {
    if (!value) return null;

    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function parseForwardedHost(value: string | null) {
    if (!value || value.includes(",")) return null;
    if (/[/?#@\s\\]/.test(value)) return null;

    try {
        return new URL(`https://${value}`).host.toLowerCase();
    } catch {
        return null;
    }
}

function getConfiguredAuthOrigins() {
    return [
        parseOrigin(process.env.NEXT_PUBLIC_APP_URL),
        parseOrigin(process.env.NEXT_PUBLIC_SITE_URL),
    ].filter((origin): origin is string => Boolean(origin));
}

function resolveAuthRedirectOrigin(request: Request, requestOrigin: string) {
    if (process.env.NODE_ENV === "development") {
        return requestOrigin;
    }

    const configuredOrigins = getConfiguredAuthOrigins();
    if (configuredOrigins.length === 0) {
        return null;
    }

    const fallbackOrigin = configuredOrigins[0];
    const allowedHosts = new Set(configuredOrigins.map((origin) => new URL(origin).host.toLowerCase()));
    const forwardedHost = parseForwardedHost(request.headers.get("x-forwarded-host"));

    if (forwardedHost && allowedHosts.has(forwardedHost)) {
        return `https://${forwardedHost}`;
    }

    return fallbackOrigin;
}

function isRecentUserCreation(createdAt: string | undefined) {
    if (!createdAt) {
        return false;
    }

    const createdAtMs = Date.parse(createdAt);
    return Number.isFinite(createdAtMs)
        && Date.now() - createdAtMs <= SIGNUP_COMPLETION_WINDOW_MS;
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = normalizeLoginNextPath(searchParams.get("next"));
    const redirectOrigin = resolveAuthRedirectOrigin(request, origin);

    if (!redirectOrigin) {
        return NextResponse.json(
            { error: "Auth redirect origin is not configured." },
            { status: 500 }
        );
    }

    if (code) {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            const user = data.user ?? data.session?.user ?? null;
            if (user && isRecentUserCreation(user.created_at)) {
                await captureServerAnalyticsEvent({
                    event: "signup_completed",
                    distinctId: user.id,
                    insertId: `signup_completed:${user.id}`,
                    properties: {
                        source: "auth_callback",
                        route: "/auth/callback",
                        user_state: "authenticated",
                    },
                });
            }

            return NextResponse.redirect(`${redirectOrigin}${next}`);
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${redirectOrigin}/login?error=AuthCodeError`);
}
