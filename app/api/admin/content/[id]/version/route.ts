import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError, isSupabaseNotFoundError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const Id = z.guid();
const Create = z.object({ sourceUpdatedAt: z.string().datetime({ offset: true }) }).strict();
type Context = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest) {
    if (!await verifyAdminSession()) return apiError("UNAUTHORIZED", "Not authenticated", 401, getRequestId());
    const limit = await rateLimit(request, { limit: 10, windowMs: 60_000 });
    if (!limit.success) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, { status: 429 });
    return null;
}

export async function POST(request: NextRequest, { params }: Context) {
    const denied = await authorize(request);
    if (denied) return denied;
    const requestId = getRequestId();
    const { id } = await params;
    const input = Create.safeParse(await request.json().catch(() => null));
    if (!Id.safeParse(id).success || !input.success) return apiError("VALIDATION_ERROR", "Invalid updated-version request", 400, requestId);
    try {
        const { data, error } = await getAdminClient().rpc("admin_create_content_version", {
            p_source_id: id, p_source_updated_at: input.data.sourceUpdatedAt,
        });
        if (error) {
            if (error.code === "40001") return apiError("CONFLICT", "The original changed or narration is processing. Reload and review it again.", 409, requestId);
            if (error.code === "22023") return apiError("VALIDATION_ERROR", "Choose an available published summary", 400, requestId);
            if (error.code === "P0002") return apiError("NOT_FOUND", "Summary not found", 404, requestId);
            throw error;
        }
        return NextResponse.json({ success: true, draftId: data }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        logApiError({ requestId, route: "/api/admin/content/[id]/version", message: "Create updated version failed", error });
        return apiError("INTERNAL_ERROR", "Could not create updated version", 500, requestId);
    }
}

// Review only persisted draft text. Its timestamps are rechecked atomically on publish.
export async function GET(request: NextRequest, { params }: Context) {
    const denied = await authorize(request);
    if (denied) return denied;
    const requestId = getRequestId();
    const { id } = await params;
    if (!Id.safeParse(id).success) return apiError("VALIDATION_ERROR", "Invalid draft ID", 400, requestId);
    try {
        const db = getAdminClient();
        const { data: draft, error: draftError } = await db.from("content_item")
            .select("id,title,updated_at,status,deleted_at,update_source_id,narration_status")
            .eq("id", id).single();
        if (draftError && !isSupabaseNotFoundError(draftError)) throw draftError;
        if (!draft) return apiError("NOT_FOUND", "Updated version not found", 404, requestId);
        if (!draft.update_source_id || draft.status !== "draft" || draft.deleted_at) {
            return apiError("VALIDATION_ERROR", "Choose an unpublished updated version", 400, requestId);
        }
        const sourceId = draft.update_source_id;
        const [sourceResult, library, highlights, reflections] = await Promise.all([
            db.from("content_item").select("id,title,updated_at,status,deleted_at,narration_status,series_id,series_order").eq("id", sourceId).single(),
            db.from("user_library").select("content_id", { count: "exact", head: true }).eq("content_id", sourceId),
            db.from("user_highlights").select("id", { count: "exact", head: true }).eq("content_item_id", sourceId),
            db.from("user_reflections").select("id", { count: "exact", head: true }).eq("content_item_id", sourceId),
        ]);
        for (const result of [sourceResult, library, highlights, reflections]) if (result.error) throw result.error;
        const source = sourceResult.data;
        if (!source || source.status !== "verified" || source.deleted_at || source.narration_status === "processing" || draft.narration_status === "processing") {
            return apiError("CONFLICT", "The original must still be published and narration must be finished. Review again when ready.", 409, requestId);
        }
        return NextResponse.json({ source, replacement: draft, preserved: {
            libraryRecords: library.count ?? 0, highlights: highlights.count ?? 0, reflections: reflections.count ?? 0,
        } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        logApiError({ requestId, route: "/api/admin/content/[id]/version", message: "Updated version review failed", error });
        return apiError("INTERNAL_ERROR", "Could not review updated version", 500, requestId);
    }
}
