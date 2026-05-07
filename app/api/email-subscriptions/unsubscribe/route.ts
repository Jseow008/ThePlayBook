import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";

const UnsubscribeSchema = z.object({
    token: z.string().trim().min(32).max(128),
});

async function unsubscribeByToken(token: string) {
    const now = new Date().toISOString();
    return getAdminClient()
        .from("email_subscription")
        .update({
            status: "unsubscribed",
            unsubscribed_at: now,
        })
        .eq("unsubscribe_token", token);
}

function unsubscribeSuccessHtml() {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unsubscribed | Flux</title>
  <style>
    body { margin: 0; background: #09090b; color: #f4f4f5; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100svh; display: grid; place-items: center; padding: 24px; }
    section { max-width: 520px; text-align: center; }
    h1 { margin: 0 0 16px; font-size: 32px; line-height: 1.1; }
    p { margin: 0; color: #a1a1aa; line-height: 1.7; }
    a { color: #f4f4f5; }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>You're unsubscribed.</h1>
      <p>You will no longer receive weekly Flux emails. You can resubscribe from the Flux homepage at any time.</p>
    </section>
  </main>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(request, { limit: 12, windowMs: 60_000 });
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
        const parsed = UnsubscribeSchema.safeParse({
            token: request.nextUrl.searchParams.get("token"),
        });

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid unsubscribe token.", 400, requestId);
        }

        const { error } = await unsubscribeByToken(parsed.data.token);

        if (error) {
            throw error;
        }

        return new NextResponse(unsubscribeSuccessHtml(), {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/email-subscriptions/unsubscribe[GET]",
            message: "Failed to unsubscribe email subscription",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not unsubscribe. Please try again.", 500, requestId);
    }
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(request, { limit: 12, windowMs: 60_000 });
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

        const parsed = UnsubscribeSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid unsubscribe token.", 400, requestId);
        }

        const { error } = await unsubscribeByToken(parsed.data.token);

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/email-subscriptions/unsubscribe",
            message: "Failed to unsubscribe email subscription",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not unsubscribe. Please try again.", 500, requestId);
    }
}
