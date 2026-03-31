import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { reportException } from "@/lib/server/error-reporting";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";

const ClientExceptionPayloadSchema = z.object({
    boundary: z.enum(["app-error-boundary", "global-error-boundary"]),
    digest: z.string().max(255).nullable(),
    message: z.string().min(1).max(2_000),
    name: z.string().min(1).max(255),
    pathname: z.string().max(1_024).nullable(),
    href: z.string().url().max(2_048).nullable(),
    stack: z.string().max(12_000).nullable(),
});

export async function POST(req: NextRequest) {
    const requestId = getRequestId();

    const rl = await bestEffortRateLimit(req, {
        limit: 20,
        windowMs: 60_000,
        key: "client-exception-report",
        routeLabel: "/api/monitor/exceptions",
    });

    if (!rl.success) {
        return new NextResponse(null, {
            headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
            status: 429,
        });
    }

    try {
        const parsed = ClientExceptionPayloadSchema.safeParse(await req.json());

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid client exception payload", 400, requestId);
        }

        await reportException({
            source: parsed.data.boundary,
            message: `${parsed.data.boundary} captured a client exception.`,
            requestId,
            route: "/api/monitor/exceptions",
            digest: parsed.data.digest,
            pathname: parsed.data.pathname,
            url: parsed.data.href,
            context: {
                client_error_name: parsed.data.name,
                user_agent: req.headers.get("user-agent"),
            },
            error: {
                name: parsed.data.name,
                message: parsed.data.message,
                stack: parsed.data.stack,
            },
        });

        return NextResponse.json({ ok: true, request_id: requestId }, { status: 202 });
    } catch (error) {
        logApiError({
            error,
            message: "Client exception monitor route failed",
            requestId,
            route: "/api/monitor/exceptions",
        });
        return apiError("INTERNAL_ERROR", "Failed to record client exception", 500, requestId);
    }
}
