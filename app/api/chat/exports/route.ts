import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit, rateLimitFailureResponseWithTelemetry } from "@/lib/server/rate-limit";
import { recordAiRouteAbuse } from "@/lib/server/security-telemetry";
import { saveChatExport } from "@/lib/server/chat-export-store";
import { CHAT_EXPORT_TTL_MS, type StoredChatExportPayload } from "@/lib/chat-export";

const MAX_ENCRYPTED_CHARS = 200_000;

const CreateChatExportSchema = z.object({
    payload: z.object({
        version: z.literal(1),
        ciphertext: z.string().min(1).max(MAX_ENCRYPTED_CHARS),
        iv: z.string().min(12).max(64),
    }),
    messageCount: z.number().int().min(1).max(100),
});

export async function POST(req: NextRequest) {
    const requestId = getRequestId();

    try {
        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Please log in to export this chat.", 401, requestId);
        }

        const rl = await rateLimit(req, { limit: 8, windowMs: 60_000, key: `${user.id}:chat-export` });
        if (!rl.success) {
            return rateLimitFailureResponseWithTelemetry({
                request: req,
                requestId,
                result: rl,
                route: "/api/chat/exports",
                category: "ai",
                userId: user.id,
                authState: "authenticated",
                message: "Too many exports. Please wait a moment.",
            });
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON body", 400, requestId);
        }

        const parsed = CreateChatExportSchema.safeParse(body);
        if (!parsed.success) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat/exports",
                userId: user.id,
                reason: "invalid_payload",
                metadata: { payload_kind: "chat_export" },
            });
            return apiError("VALIDATION_ERROR", "Invalid chat export payload", 400, requestId);
        }

        const now = Date.now();
        const expiresAt = new Date(now + CHAT_EXPORT_TTL_MS).toISOString();
        const id = crypto.randomUUID();
        const storedPayload: StoredChatExportPayload = {
            ...parsed.data.payload,
            createdAt: new Date(now).toISOString(),
            expiresAt,
            messageCount: parsed.data.messageCount,
        };

        await saveChatExport(id, storedPayload);

        return NextResponse.json(
            { id, expiresAt },
            {
                status: 201,
                headers: { "Cache-Control": "no-store" },
            }
        );
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/chat/exports",
            message: "Failed to create chat export",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not create chat export. Please try again.", 500, requestId);
    }
}
