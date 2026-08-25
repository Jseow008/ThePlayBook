import { NextResponse } from "next/server";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { normalizeLoginNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";

const SIGNUP_COMPLETION_WINDOW_MS = 24 * 60 * 60 * 1000;

function isRecentUserCreation(createdAt: string | undefined) {
    if (!createdAt) return false;

    const createdAtMs = Date.parse(createdAt);
    return Number.isFinite(createdAtMs) && Date.now() - createdAtMs <= SIGNUP_COMPLETION_WINDOW_MS;
}

export async function POST(request: Request) {
    const body = await request.json().catch(() => null) as {
        email?: unknown;
        token?: unknown;
        next?: unknown;
    } | null;

    if (typeof body?.email !== "string" || typeof body.token !== "string") {
        return NextResponse.json({ error: "Enter your email and verification code." }, { status: 400 });
    }

    const email = body.email.trim();
    const token = body.token.trim();

    if (!email || !token) {
        return NextResponse.json({ error: "Enter your email and verification code." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

    if (error) {
        return NextResponse.json({ error: "That code is invalid or has expired. Please try again." }, { status: 401 });
    }

    const user = data.user ?? data.session?.user ?? null;
    if (user && isRecentUserCreation(user.created_at)) {
        await captureServerAnalyticsEvent({
            event: "signup_completed",
            distinctId: user.id,
            insertId: `signup_completed:${user.id}`,
            properties: {
                source: "auth_otp_verify",
                auth_method: "email",
                route: "/login",
                user_state: "authenticated",
            },
        });
    }

    return NextResponse.json({ next: normalizeLoginNextPath(typeof body.next === "string" ? body.next : undefined) });
}
