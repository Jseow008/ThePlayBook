import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { readChatExport } from "@/lib/server/chat-export-store";

interface RouteContext {
    params: Promise<{ id: string }>;
}

const ExportIdSchema = z.string().uuid();

export async function GET(_req: NextRequest, context: RouteContext) {
    const requestId = getRequestId();

    try {
        const { id } = await context.params;
        const parsedId = ExportIdSchema.safeParse(id);
        if (!parsedId.success) {
            return apiError("VALIDATION_ERROR", "Invalid chat export id", 400, requestId);
        }

        const payload = await readChatExport(parsedId.data);
        if (!payload || new Date(payload.expiresAt).getTime() <= Date.now()) {
            return apiError("NOT_FOUND", "This chat export has expired.", 410, requestId);
        }

        return NextResponse.json(
            {
                payload: {
                    version: payload.version,
                    ciphertext: payload.ciphertext,
                    iv: payload.iv,
                },
                expiresAt: payload.expiresAt,
            },
            {
                headers: { "Cache-Control": "no-store" },
            }
        );
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/chat/exports/[id]",
            message: "Failed to read chat export",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not load chat export. Please try again.", 500, requestId);
    }
}
