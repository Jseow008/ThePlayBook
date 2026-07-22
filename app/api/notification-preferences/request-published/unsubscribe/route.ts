import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { unsubscribeRequestPublishedNotificationsByToken } from "@/lib/server/email-subscription-rpcs";
import { rateLimit, rateLimitFailureResponseWithTelemetry } from "@/lib/server/rate-limit";
import { recordInvalidUnsubscribeToken } from "@/lib/server/security-telemetry";

const UnsubscribeSchema = z.object({
    token: z.string().trim().min(32).max(128).regex(/^[a-f0-9]+$/i),
});

function unsubscribeHtml() {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Request notifications turned off</title>
    <style>
      body { margin: 0; font-family: Inter, Arial, sans-serif; background: #0a0a0a; color: #f5f5f5; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { max-width: 520px; border: 1px solid #27272a; border-radius: 16px; padding: 28px; background: #111113; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0; color: #a1a1aa; line-height: 1.6; }
      a { color: #f5f5f5; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Request notifications are off.</h1>
        <p>You will no longer receive emails when Netflux publishes summaries you requested or voted for. You can turn them back on from <a href="/settings">Settings</a>.</p>
      </section>
    </main>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(request, { limit: 12, windowMs: 60_000 });
    if (!rl.success) {
        return rateLimitFailureResponseWithTelemetry({
            request,
            requestId,
            result: rl,
            route: "/api/notification-preferences/request-published/unsubscribe[GET]",
            category: "unsubscribe",
            authState: "anonymous",
            message: "Too many requests.",
        });
    }

    const parsed = UnsubscribeSchema.safeParse({
        token: request.nextUrl.searchParams.get("token"),
    });

    if (!parsed.success) {
        recordInvalidUnsubscribeToken({
            request,
            requestId,
            route: "/api/notification-preferences/request-published/unsubscribe[GET]",
            channel: "request_published",
        });
        return apiError("VALIDATION_ERROR", "Invalid unsubscribe token.", 400, requestId);
    }

    try {
        const { error } = await unsubscribeRequestPublishedNotificationsByToken({
            p_token: parsed.data.token,
        });

        if (error) {
            throw error;
        }

        return new NextResponse(unsubscribeHtml(), {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/notification-preferences/request-published/unsubscribe[GET]",
            message: "Failed to unsubscribe request notification emails",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not update notification preferences.", 500, requestId);
    }
}
