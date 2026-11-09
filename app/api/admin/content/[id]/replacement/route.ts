import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { isAutomaticNarrationOnPublishEnabled } from "@/lib/server/narration-policy";
import { processNextNarrationJob } from "@/lib/server/narration-processor";
import { queueNarrationJobIfEligible } from "@/lib/server/narration-queue";
import { getSeriesSlugsByIds, revalidateContentDeleted, revalidateContentUpdated, revalidateReplacementRoutes } from "@/lib/server/revalidation";

export const maxDuration = 300;

const IdSchema = z.guid();
const ReplaceSchema = z.object({
    replacementId: IdSchema,
    sourceUpdatedAt: z.string().datetime({ offset: true }),
    replacementUpdatedAt: z.string().datetime({ offset: true }),
}).strict();
type Context = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest) {
    if (!await verifyAdminSession()) return apiError("UNAUTHORIZED", "Not authenticated", 401, getRequestId());
    const limit = await rateLimit(request, { limit: 10, windowMs: 60_000 });
    if (!limit.success) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, { status: 429 });
    return null;
}

export async function GET(request: NextRequest, { params }: Context) {
    const denied = await authorize(request);
    if (denied) return denied;
    const { id } = await params;
    const replacementId = request.nextUrl.searchParams.get("replacementId");
    const requestId = getRequestId();
    if (!IdSchema.safeParse(id).success || !IdSchema.safeParse(replacementId).success || id === replacementId) {
        return apiError("VALIDATION_ERROR", "Choose two different summaries", 400, requestId);
    }
    try {
        const db = getAdminClient();
        const [items, library, highlights, reflections] = await Promise.all([
            db.from("content_item").select("id, title, updated_at, status, deleted_at, narration_status").in("id", [id, replacementId!]),
            db.from("user_library").select("content_id", { count: "exact", head: true }).eq("content_id", id),
            db.from("user_highlights").select("id", { count: "exact", head: true }).eq("content_item_id", id),
            db.from("user_reflections").select("id", { count: "exact", head: true }).eq("content_item_id", id),
        ]);
        for (const result of [items, library, highlights, reflections]) if (result.error) throw result.error;
        const source = items.data?.find((item) => item.id === id);
        const replacement = items.data?.find((item) => item.id === replacementId);
        if (!source || !replacement) return apiError("NOT_FOUND", "Summary not found", 404, requestId);
        if ([source, replacement].some((item) => item.status !== "verified" || item.deleted_at)) {
            return apiError("VALIDATION_ERROR", "Both summaries must be published and available", 400, requestId);
        }
        if (source.narration_status === "processing") {
            return apiError("CONFLICT", "Wait for the original narration to finish, then preview again.", 409, requestId);
        }
        return NextResponse.json({ source, replacement, preserved: {
            libraryRecords: library.count ?? 0, highlights: highlights.count ?? 0, reflections: reflections.count ?? 0,
        } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        logApiError({ requestId, route: "/api/admin/content/[id]/replacement", message: "Replacement preview failed", error });
        return apiError("INTERNAL_ERROR", "Could not preview replacement", 500, requestId);
    }
}

export async function POST(request: NextRequest, { params }: Context) {
    const denied = await authorize(request);
    if (denied) return denied;
    const requestId = getRequestId();
    const { id } = await params;
    let input: z.infer<typeof ReplaceSchema>;
    try {
        input = ReplaceSchema.parse(await request.json());
        if (!IdSchema.safeParse(id).success || input.replacementId === id) throw new Error("Invalid IDs");
    } catch {
        return apiError("VALIDATION_ERROR", "Invalid replacement request", 400, requestId);
    }
    try {
        const db = getAdminClient();
        const { data: items, error: itemsError } = await db.from("content_item")
            .select("id, title, series_id, status, audio_url, narration_status").in("id", [id, input.replacementId]);
        if (itemsError) throw itemsError;
        const targetBeforePublish = items?.find((item) => item.id === input.replacementId);
        const { data, error } = await db.rpc("admin_replace_content", {
            p_source_id: id, p_replacement_id: input.replacementId,
            p_source_updated_at: input.sourceUpdatedAt, p_replacement_updated_at: input.replacementUpdatedAt,
        });
        if (error) {
            if (error.code === "40001") return apiError("CONFLICT", "Summary changed. Preview the replacement again.", 409, requestId);
            if (error.code === "22023") return apiError("VALIDATION_ERROR", "Replacement must be available and ready to publish. Complete required publish fields and wait for narration before reviewing an updated version again.", 400, requestId);
            if (error.code === "23505") return apiError("CONFLICT", "The updated version conflicts with an existing book identity, ISBN or series position. Edit the draft and review again.", 409, requestId);
            if (error.code === "P0002") return apiError("NOT_FOUND", "Summary not found", 404, requestId);
            throw error;
        }
        const seriesSlugs = await getSeriesSlugsByIds(db, (items ?? []).map((item) => item.series_id));
        for (const item of items ?? []) {
            if (item.id === id) revalidateContentDeleted({ ...item, seriesSlugs });
            else revalidateContentUpdated({ id: item.id, nextTitle: item.title, seriesSlugs });
        }
        // This also expires any flattened incoming notice, including old slugs.
        revalidateReplacementRoutes();

        let narrationWarning: string | null = null;
        if (targetBeforePublish?.status === "draft" && isAutomaticNarrationOnPublishEnabled()) {
            try {
                const { queued } = await queueNarrationJobIfEligible({
                    supabase: db,
                    contentId: input.replacementId,
                    row: targetBeforePublish,
                });
                if (queued) {
                    after(async () => {
                        try {
                            await processNextNarrationJob(`${requestId}:background`);
                        } catch (backgroundError) {
                            logApiError({
                                requestId,
                                route: "/api/admin/content/[id]/replacement",
                                message: "Background AI narration processor failed after publishing updated version",
                                error: backgroundError,
                            });
                        }
                    });
                }
            } catch (queueError) {
                narrationWarning = "Updated version was published, but AI narration could not be queued automatically.";
                logApiError({
                    requestId,
                    route: "/api/admin/content/[id]/replacement",
                    message: "Failed to auto-queue AI narration after publishing updated version",
                    error: queueError,
                });
            }
        }
        return NextResponse.json({ success: true, data, narrationWarning }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        logApiError({ requestId, route: "/api/admin/content/[id]/replacement", message: "Replacement failed", error });
        return apiError("INTERNAL_ERROR", "Could not replace summary", 500, requestId);
    }
}
