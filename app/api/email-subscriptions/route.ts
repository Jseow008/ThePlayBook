import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, isPostgresUniqueViolation, logApiError } from "@/lib/server/api";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { rateLimit } from "@/lib/server/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type EmailSubscriptionInsert = Database["public"]["Tables"]["email_subscription"]["Insert"];
type EmailSubscriptionUpdate = Database["public"]["Tables"]["email_subscription"]["Update"];

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

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
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

        const supabase = getAdminClient();
        const normalizedEmail = normalizeEmail(parsed.data.email);
        const basePayload = {
            email: parsed.data.email,
            source: parsed.data.source,
            page_path: cleanOptionalText(parsed.data.page_path),
            referrer: cleanOptionalText(parsed.data.referrer),
            user_agent: cleanOptionalText(request.headers.get("user-agent"))?.slice(0, 512) ?? null,
            consent_text: EMAIL_SUBSCRIPTION_CONSENT_TEXT,
            consent_version: EMAIL_SUBSCRIPTION_CONSENT_VERSION,
        };

        const insertPayload: EmailSubscriptionInsert = {
            ...basePayload,
            status: "subscribed",
            unsubscribed_at: null,
        };

        const { error } = await supabase
            .from("email_subscription")
            .insert(insertPayload);

        if (error) {
            if (!isPostgresUniqueViolation(error)) {
                throw error;
            }

            const updatePayload: EmailSubscriptionUpdate = {
                ...basePayload,
                status: "subscribed",
                subscribed_at: new Date().toISOString(),
                unsubscribed_at: null,
            };

            const { error: updateError } = await supabase
                .from("email_subscription")
                .update(updatePayload)
                .eq("email_normalized", normalizedEmail);

            if (updateError) {
                throw updateError;
            }
        }

        await captureServerAnalyticsEvent({
            event: "email_subscribed",
            distinctId: `anonymous:${requestId}`,
            insertId: `email_subscribed:${requestId}`,
            properties: {
                source: parsed.data.source,
                path: basePayload.page_path ?? undefined,
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
