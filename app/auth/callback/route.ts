import { NextResponse } from "next/server";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { createClient } from "@/lib/supabase/server";
import { normalizeLoginNextPath } from "@/lib/auth-redirect";

const SIGNUP_COMPLETION_WINDOW_MS = 24 * 60 * 60 * 1000;

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

            const forwardedHost = request.headers.get("x-forwarded-host");
            const isLocalEnv = process.env.NODE_ENV === "development";

            let redirectUrl = `${origin}${next}`;
            if (!isLocalEnv && forwardedHost) {
                redirectUrl = `https://${forwardedHost}${next}`;
            }

            return NextResponse.redirect(redirectUrl);
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=AuthCodeError`);
}
