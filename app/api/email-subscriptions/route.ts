import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { rateLimit } from "@/lib/server/rate-limit";
import { createPublicServerClient } from "@/lib/supabase/public-server";

const EMAIL_SUBSCRIPTION_CONSENT_VERSION = "weekly-ideas-v1";
const EMAIL_SUBSCRIPTION_CONSENT_TEXT =
    "Subscribe to receive weekly non-fiction ideas from Netflux by email.";

const SubscriptionSourceSchema = z.enum(["landing_final_cta"]);

const EmailSubscriptionSchema = z.object({
    email: z.string().trim().email().max(254),
    source: SubscriptionSourceSchema.default("landing_final_cta"),
    page_path: z.string().trim().max(256).optional().nullable(),
    referrer: z.string().trim().max(512).optional().nullable(),
});

function cleanOptionalText(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(request, { limit: 8, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            {
                status: 429,
                headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
            }
        );
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
        }

        const parsed = EmailSubscriptionSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Enter a valid email address.", 400, requestId);
        }

        const pagePath = cleanOptionalText(parsed.data.page_path);
        const referrer = cleanOptionalText(parsed.data.referrer);
        const { error } = await createPublicServerClient().rpc("subscribe_email_subscription", {
            p_email: parsed.data.email,
            p_source: parsed.data.source,
            p_page_path: pagePath,
            p_referrer: referrer,
            p_user_agent: cleanOptionalText(request.headers.get("user-agent"))?.slice(0, 512) ?? null,
            p_consent_text: EMAIL_SUBSCRIPTION_CONSENT_TEXT,
            p_consent_version: EMAIL_SUBSCRIPTION_CONSENT_VERSION,
        });
        if (error) {
            throw error;
        }

        await captureServerAnalyticsEvent({
            event: "email_subscribed",
            distinctId: `anonymous:${requestId}`,
            insertId: `email_subscribed:${requestId}`,
            properties: {
                source: parsed.data.source,
                path: pagePath ?? undefined,
                route: "/api/email-subscriptions",
                user_state: "anonymous",
            },
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/email-subscriptions",
            message: "Failed to save email subscription",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not save your subscription. Please try again.", 500, requestId);
    }
}
