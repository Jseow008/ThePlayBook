"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getRequestId, logApiError } from "@/lib/server/api";
import {
    CONTENT_REQUEST_NOTIFICATION_BATCH_SIZE,
    processQueuedContentRequestNotifications,
    queueContentRequestPublishedNotifications,
} from "@/lib/server/content-request-notifications";
import { getAdminClient } from "@/lib/supabase/admin";

const UpdateRequestSchema = z.object({
    requestId: z.string().uuid(),
    status: z.enum(["requested", "under_review", "in_progress", "published", "source_unavailable", "archived"]),
    publishedContentId: z.string().trim().optional(),
    sourceAvailabilityNote: z.string().trim().max(1000).optional(),
    adminNote: z.string().trim().max(2000).optional(),
    hiddenReason: z.string().trim().max(500).optional(),
    hideRequest: z.enum(["true", "false"]).default("false"),
});

function emptyToNull(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function getOptionalString(formData: FormData, name: string) {
    const value = formData.get(name);
    return typeof value === "string" ? value : undefined;
}

export async function updateContentRequest(formData: FormData): Promise<void> {
    const requestId = getRequestId();
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        throw new Error("Unauthorized");
    }

    const parsed = UpdateRequestSchema.safeParse({
        requestId: formData.get("requestId"),
        status: formData.get("status"),
        publishedContentId: getOptionalString(formData, "publishedContentId"),
        sourceAvailabilityNote: getOptionalString(formData, "sourceAvailabilityNote"),
        adminNote: getOptionalString(formData, "adminNote"),
        hiddenReason: getOptionalString(formData, "hiddenReason"),
        hideRequest: formData.get("hideRequest") || "false",
    });

    if (!parsed.success) {
        throw new Error("Invalid request update.");
    }

    const supabase = getAdminClient();
    const publishedContentId = emptyToNull(parsed.data.publishedContentId);
    const { data: existingRequest, error: existingRequestError } = await (supabase as any).from("content_requests")
        .select("id, status, published_content_id")
        .eq("id", parsed.data.requestId)
        .single();

    if (existingRequestError) {
        console.error("Failed to load content request before update:", existingRequestError);
        throw new Error("Failed to update content request.");
    }

    const { error } = await (supabase as any).from("content_requests")
        .update({
            status: parsed.data.status,
            published_content_id: publishedContentId,
            source_availability_note: emptyToNull(parsed.data.sourceAvailabilityNote),
            admin_note: emptyToNull(parsed.data.adminNote),
            hidden_at: parsed.data.hideRequest === "true" ? new Date().toISOString() : null,
            hidden_reason: parsed.data.hideRequest === "true" ? emptyToNull(parsed.data.hiddenReason) : null,
        })
        .eq("id", parsed.data.requestId);

    if (error) {
        console.error("Failed to update content request:", error);
        throw new Error("Failed to update content request.");
    }

    const shouldQueuePublishedNotifications = existingRequest.status !== "published"
        && parsed.data.status === "published"
        && Boolean(publishedContentId);

    if (shouldQueuePublishedNotifications) {
        try {
            const queuedCount = await queueContentRequestPublishedNotifications(parsed.data.requestId);

            if (queuedCount > 0) {
                after(async () => {
                    try {
                        await processQueuedContentRequestNotifications(CONTENT_REQUEST_NOTIFICATION_BATCH_SIZE);
                    } catch (backgroundError) {
                        logApiError({
                            requestId,
                            route: "/admin/requests",
                            message: "Background request notification processor failed after publishing request",
                            error: backgroundError,
                        });
                    }
                });
            }
        } catch (queueError) {
            logApiError({
                requestId,
                route: "/admin/requests",
                message: "Failed to queue request published notifications",
                error: queueError,
            });
        }
    }

    revalidatePath("/requests");
    revalidatePath("/admin");
    revalidatePath("/admin/requests");
}
