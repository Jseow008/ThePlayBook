import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { strictPublicRateLimit, rateLimitFailureResponseWithTelemetry } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 2_048;
const SettingsRequest = z.object({
    expectedAccountId: z.string().min(1).max(128),
    settings: z.object({
        fontSize: z.enum(["small", "medium", "large"]),
        fontFamily: z.enum(["sans", "serif"]),
        readerTheme: z.enum(["dark", "light", "sepia"]),
        lineHeight: z.enum(["compact", "default", "relaxed"]),
        updatedAt: z.string().datetime(),
    }).strict(),
}).strict();

export async function POST(request: NextRequest) {
    const requestId = getRequestId();
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return apiError("UNAUTHORIZED", "Sign in to save reader settings.", 401, requestId);

        const admission = await strictPublicRateLimit(request, {
            limit: 30, windowMs: 60_000, identifier: user.id,
            key: "reader-settings-write", routeLabel: "reader-settings-write",
        });
        if (!admission.success) return rateLimitFailureResponseWithTelemetry({
            request, requestId, result: admission, route: "POST /api/reader-settings",
            category: "public", userId: user.id, authState: "authenticated",
        });

        let body: unknown;
        try {
            if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return apiError("VALIDATION_ERROR", "Reader settings are too large.", 413, requestId);
            const reader = request.body?.getReader();
            if (!reader) return apiError("INVALID_JSON", "Invalid JSON payload.", 400, requestId);
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > MAX_BODY_BYTES) {
                    await reader.cancel();
                    return apiError("VALIDATION_ERROR", "Reader settings are too large.", 413, requestId);
                }
                chunks.push(value);
            }
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON payload.", 400, requestId);
        }
        const parsed = SettingsRequest.safeParse(body);
        if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid reader settings.", 400, requestId);
        if (parsed.data.expectedAccountId !== user.id) return apiError("CONFLICT", "Your account changed. Try again.", 409, requestId);

        const { data, error } = await getAdminClient().from("profiles")
            .update({ reader_settings: parsed.data.settings })
            .eq("id", user.id).select("id").single();
        if (error || !data) {
            logApiError({ requestId, route: "POST /api/reader-settings", message: "Could not save reader settings", error });
            return apiError("INTERNAL_ERROR", "Could not save reader settings.", 503, requestId);
        }
        return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        logApiError({ requestId, route: "POST /api/reader-settings", message: "Could not save reader settings", error });
        return apiError("INTERNAL_ERROR", "Could not save reader settings.", 503, requestId);
    }
}
