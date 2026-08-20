import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { getVerifiedContentIssues } from "@/lib/server/admin-content-publish";
import { processNextNarrationJob } from "@/lib/server/narration-processor";
import { queueNarrationJobIfEligible } from "@/lib/server/narration-queue";
import { processNextStoryImageJob } from "@/lib/server/story-image-processor";
import { requestStoryImageGeneration } from "@/lib/server/story-image-queue";
import {
    getSeriesSlugsByIds,
    revalidateContentBulkChanged,
    revalidateContentFeaturedChanged,
    revalidateNarrationContentChanged,
} from "@/lib/server/revalidation";

export const maxDuration = 300;

const BulkActionSchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(100),
    action: z.enum([
        "publish",
        "draft",
        "feature",
        "unfeature",
        "delete",
        "queue_narration",
    ]),
});

function summarizeResults(params: {
    action: z.infer<typeof BulkActionSchema>["action"];
    updatedCount: number;
    skippedCount: number;
    queuedCount: number;
}) {
    const noun = params.updatedCount === 1 ? "item" : "items";

    switch (params.action) {
        case "publish":
            return `${params.updatedCount} ${noun} published${params.skippedCount > 0 ? `, ${params.skippedCount} skipped` : ""}.`;
        case "draft":
            return `${params.updatedCount} ${noun} moved to draft${params.skippedCount > 0 ? `, ${params.skippedCount} skipped` : ""}.`;
        case "feature":
            return `${params.updatedCount} ${noun} featured${params.skippedCount > 0 ? `, ${params.skippedCount} skipped` : ""}.`;
        case "unfeature":
            return `${params.updatedCount} ${noun} unfeatured${params.skippedCount > 0 ? `, ${params.skippedCount} skipped` : ""}.`;
        case "delete":
            return `${params.updatedCount} ${noun} deleted${params.skippedCount > 0 ? `, ${params.skippedCount} skipped` : ""}.`;
        case "queue_narration":
            return `${params.queuedCount} ${params.queuedCount === 1 ? "narration job" : "narration jobs"} queued${params.skippedCount > 0 ? `, ${params.skippedCount} skipped` : ""}.`;
        default:
            return "Bulk action completed.";
    }
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch (error) {
            logApiError({
                requestId,
                route: "/api/admin/content/bulk",
                message: "Invalid JSON body for content bulk action",
                error,
            });
            return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
        }

        const parsed = BulkActionSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid request", 400, requestId, parsed.error.issues);
        }

        const { ids, action } = parsed.data;
        const uniqueIds = Array.from(new Set(ids));
        const supabase = getAdminClient();
        const { data: items, error } = await supabase
            .from("content_item")
            .select("id, title, status, is_featured, series_id, cover_image_url, category, quick_mode_json, audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at, deleted_at")
            .in("id", uniqueIds);

        if (error) {
            throw error;
        }

        const availableItems = (items ?? []).filter((item) => !item.deleted_at);
        const skipped: Array<{ id: string; title: string; reason: string }> = [];
        const touchedSeriesIds = new Set<string>();

        availableItems.forEach((item) => {
            if (item.series_id) {
                touchedSeriesIds.add(item.series_id);
            }
        });

        const itemIds = new Set(availableItems.map((item) => item.id));
        uniqueIds.forEach((id) => {
            if (!itemIds.has(id)) {
                skipped.push({
                    id,
                    title: "Unknown content",
                    reason: "Content was not found or has already been deleted.",
                });
            }
        });

        let updatedIds: string[] = [];
        let queuedCount = 0;
        let queuedStoryImageCount = 0;

        if (action === "publish") {
            const segmentsByItem = new Map<string, Array<{ markdown_body: string | null }>>();

            if (availableItems.length > 0) {
                const { data: segments, error: segmentError } = await supabase
                    .from("segment")
                    .select("item_id, markdown_body")
                    .is("deleted_at", null)
                    .in("item_id", availableItems.map((item) => item.id));

                if (segmentError) {
                    throw segmentError;
                }

                (segments ?? []).forEach((segment) => {
                    const current = segmentsByItem.get(segment.item_id) ?? [];
                    current.push({ markdown_body: segment.markdown_body });
                    segmentsByItem.set(segment.item_id, current);
                });
            }

            const eligibleToPublish = availableItems.filter((item) => {
                if (item.status === "verified") {
                    skipped.push({
                        id: item.id,
                        title: item.title,
                        reason: "Already published.",
                    });
                    return false;
                }

                const issues = getVerifiedContentIssues({
                    status: "verified",
                    cover_image_url: item.cover_image_url,
                    category: item.category,
                    quick_mode_json: item.quick_mode_json as any,
                    segments: segmentsByItem.get(item.id) ?? [],
                });

                if (issues.length > 0) {
                    skipped.push({
                        id: item.id,
                        title: item.title,
                        reason: issues[0]?.message || "Missing required publish fields.",
                    });
                    return false;
                }

                return true;
            });

            updatedIds = eligibleToPublish.map((item) => item.id);

            if (updatedIds.length > 0) {
                const { error: updateError } = await supabase
                    .from("content_item")
                    .update({
                        status: "verified",
                        embedding: null,
                    })
                    .in("id", updatedIds);

                if (updateError) {
                    throw updateError;
                }

                for (const item of eligibleToPublish) {
                    try {
                        const { queued } = await queueNarrationJobIfEligible({
                            supabase,
                            contentId: item.id,
                            row: {
                                audio_url: item.audio_url,
                                narration_status: item.narration_status,
                                narration_error: item.narration_error,
                                narration_requested_at: item.narration_requested_at,
                                narration_started_at: item.narration_started_at,
                                narration_completed_at: item.narration_completed_at,
                            },
                        });

                        if (queued) {
                            queuedCount += 1;
                        }
                    } catch (queueError) {
                        skipped.push({
                            id: item.id,
                            title: item.title,
                            reason: "Published, but narration could not be queued automatically.",
                        });
                        logApiError({
                            requestId,
                            route: "/api/admin/content/bulk",
                            message: "Failed to auto-queue narration during bulk publish",
                            error: queueError,
                        });
                    }

                    try {
                        const { queued } = await requestStoryImageGeneration({
                            supabase,
                            contentId: item.id,
                        });
                        if (queued) queuedStoryImageCount += 1;
                    } catch (queueError) {
                        skipped.push({
                            id: item.id,
                            title: item.title,
                            reason: "Published, but the share image could not be prepared automatically.",
                        });
                        logApiError({
                            requestId,
                            route: "/api/admin/content/bulk",
                            message: "Failed to queue story image during bulk publish",
                            error: queueError,
                        });
                    }
                }
            }
        }

        if (action === "draft") {
            const eligible = availableItems.filter((item) => {
                if (item.status === "draft") {
                    skipped.push({
                        id: item.id,
                        title: item.title,
                        reason: "Already a draft.",
                    });
                    return false;
                }

                return true;
            });

            updatedIds = eligible.map((item) => item.id);

            if (updatedIds.length > 0) {
                const { error: updateError } = await supabase
                    .from("content_item")
                    .update({ status: "draft" })
                    .in("id", updatedIds);

                if (updateError) {
                    throw updateError;
                }
            }
        }

        if (action === "feature" || action === "unfeature") {
            const shouldBeFeatured = action === "feature";
            const eligible = availableItems.filter((item) => {
                if (item.is_featured === shouldBeFeatured) {
                    skipped.push({
                        id: item.id,
                        title: item.title,
                        reason: shouldBeFeatured ? "Already featured." : "Already not featured.",
                    });
                    return false;
                }

                return true;
            });

            updatedIds = eligible.map((item) => item.id);

            if (updatedIds.length > 0) {
                const { error: updateError } = await supabase
                    .from("content_item")
                    .update({ is_featured: shouldBeFeatured })
                    .in("id", updatedIds);

                if (updateError) {
                    throw updateError;
                }
            }
        }

        if (action === "delete") {
            updatedIds = availableItems.map((item) => item.id);

            if (updatedIds.length > 0) {
                const { error: updateError } = await supabase
                    .from("content_item")
                    .update({ deleted_at: new Date().toISOString() })
                    .in("id", updatedIds);

                if (updateError) {
                    throw updateError;
                }
            }
        }

        if (action === "queue_narration") {
            const eligible = availableItems.filter((item) => {
                if (item.status !== "verified") {
                    skipped.push({
                        id: item.id,
                        title: item.title,
                        reason: "Publish first to enable AI voice.",
                    });
                    return false;
                }

                return true;
            });

            updatedIds = eligible.map((item) => item.id);

            for (const item of eligible) {
                try {
                    const { queued } = await queueNarrationJobIfEligible({
                        supabase,
                        contentId: item.id,
                        row: {
                            audio_url: item.audio_url,
                            narration_status: item.narration_status,
                            narration_error: item.narration_error,
                            narration_requested_at: item.narration_requested_at,
                            narration_started_at: item.narration_started_at,
                            narration_completed_at: item.narration_completed_at,
                        },
                        allowReplaceExisting: true,
                    });

                    if (queued) {
                        queuedCount += 1;
                    } else {
                        skipped.push({
                            id: item.id,
                            title: item.title,
                            reason: "Narration could not be queued right now.",
                        });
                    }
                } catch (queueError) {
                    skipped.push({
                        id: item.id,
                        title: item.title,
                        reason: "Narration could not be queued right now.",
                    });
                    logApiError({
                        requestId,
                        route: "/api/admin/content/bulk",
                        message: "Failed to queue narration during bulk action",
                        error: queueError,
                    });
                }
            }
        }

        if (queuedCount > 0) {
            after(async () => {
                try {
                    await processNextNarrationJob(`${requestId}:background`);
                } catch (backgroundError) {
                    logApiError({
                        requestId,
                        route: "/api/admin/content/bulk",
                        message: "Background narration processor failed after bulk queue",
                        error: backgroundError,
                    });
                }
            });
        }


        if (queuedStoryImageCount > 0) {
            after(async () => {
                try {
                    await processNextStoryImageJob(`${requestId}:story-image`);
                } catch (backgroundError) {
                    logApiError({
                        requestId,
                        route: "/api/admin/content/bulk",
                        message: "Background story image processor failed after bulk publish",
                        error: backgroundError,
                    });
                }
            });
        }

        const seriesSlugs = await getSeriesSlugsByIds(supabase, Array.from(touchedSeriesIds));
        const updatedIdSet = new Set(updatedIds);
        const updatedItems = availableItems.filter((item) => updatedIdSet.has(item.id));

        if (action === "feature" || action === "unfeature") {
            revalidateContentFeaturedChanged({ ids: updatedIds });
        } else if (action === "queue_narration") {
            revalidateNarrationContentChanged(updatedItems);
        } else {
            revalidateContentBulkChanged({
                items: updatedItems,
                includeAdminEditPaths: action !== "delete",
                seriesSlugs,
            });
        }

        return NextResponse.json({
            success: true,
            data: {
                action,
                updated_ids: updatedIds,
                updated_count: updatedIds.length,
                queued_count: queuedCount,
                queued_story_image_count: queuedStoryImageCount,
                skipped,
                skipped_count: skipped.length,
                message: summarizeResults({
                    action,
                    updatedCount: updatedIds.length,
                    skippedCount: skipped.length,
                    queuedCount,
                }),
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content/bulk",
            message: "Error executing bulk content action",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to execute bulk content action", 500, requestId);
    }
}
