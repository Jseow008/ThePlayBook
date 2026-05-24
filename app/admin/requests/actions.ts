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
import { CONTENT_REQUEST_STATUSES } from "@/types/content-requests";

const UpdateRequestSchema = z.object({
    requestId: z.string().uuid(),
    status: z.enum(CONTENT_REQUEST_STATUSES),
    publishedContentId: z.string().trim().optional(),
    sourceAvailabilityNote: z.string().trim().max(1000).optional(),
    adminNote: z.string().trim().max(2000).optional(),
    hiddenReason: z.string().trim().max(500).optional(),
    hideRequest: z.enum(["true", "false"]).default("false"),
}).superRefine((data, context) => {
    if (data.status === "published" && !data.publishedContentId?.trim()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["publishedContentId"],
            message: "Published requests must be linked to content.",
        });
    }

    if ((data.status === "skipped" || data.status === "failed") && !data.adminNote?.trim()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["adminNote"],
            message: "Skipped and failed requests require an admin reason.",
        });
    }
});

export type UpdateContentRequestState = {
    status: "idle" | "success" | "error";
    message: string | null;
    fieldErrors?: Partial<Record<"publishedContentId" | "adminNote" | "hiddenReason" | "status", string>>;
};

function emptyToNull(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function getOptionalString(formData: FormData, name: string) {
    const value = formData.get(name);
    return typeof value === "string" ? value : undefined;
}

function getFieldErrors(error: z.ZodError): UpdateContentRequestState["fieldErrors"] {
    const flattened = error.flatten().fieldErrors;

    return {
        publishedContentId: flattened.publishedContentId?.[0],
        adminNote: flattened.adminNote?.[0],
        hiddenReason: flattened.hiddenReason?.[0],
        status: flattened.status?.[0],
    };
}

export async function updateContentRequest(
    _previousState: UpdateContentRequestState,
    formData: FormData
): Promise<UpdateContentRequestState> {
    const requestId = getRequestId();
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return {
            status: "error",
            message: "Your admin session could not be verified. Sign in again and retry.",
        };
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
        return {
            status: "error",
            message: "Fix the highlighted fields and try again.",
            fieldErrors: getFieldErrors(parsed.error),
        };
    }

    const supabase = getAdminClient();
    const publishedContentId = emptyToNull(parsed.data.publishedContentId);
    const { data: existingRequest, error: existingRequestError } = await (supabase as any).from("content_requests")
        .select("id, status, published_content_id")
        .eq("id", parsed.data.requestId)
        .single();

    if (existingRequestError) {
        console.error("Failed to load content request before update:", existingRequestError);
        return {
            status: "error",
            message: "Could not load this request before saving. Refresh and try again.",
        };
    }

    const updatePayload: Record<string, string | null> = {
        status: parsed.data.status,
        published_content_id: publishedContentId,
        admin_note: emptyToNull(parsed.data.adminNote),
        hidden_at: parsed.data.hideRequest === "true" ? new Date().toISOString() : null,
        hidden_reason: parsed.data.hideRequest === "true" ? emptyToNull(parsed.data.hiddenReason) : null,
    };

    if (parsed.data.sourceAvailabilityNote !== undefined) {
        updatePayload.source_availability_note = emptyToNull(parsed.data.sourceAvailabilityNote);
    }

    const { error } = await (supabase as any).from("content_requests")
        .update(updatePayload)
        .eq("id", parsed.data.requestId);

    if (error) {
        console.error("Failed to update content request:", error);
        return {
            status: "error",
            message: "The request could not be saved. Check server logs if this keeps happening.",
        };
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

    return {
        status: "success",
        message: "Request saved.",
    };
}
