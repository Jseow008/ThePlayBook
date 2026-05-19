"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";

const UpdateRequestSchema = z.object({
    requestId: z.string().uuid(),
    status: z.enum(["requested", "under_review", "in_progress", "published", "source_unavailable", "archived"]),
    publishedContentId: z.string().trim().optional(),
    hiddenReason: z.string().trim().max(500).optional(),
    hideRequest: z.enum(["true", "false"]).default("false"),
});

function emptyToNull(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export async function updateContentRequest(formData: FormData): Promise<void> {
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        throw new Error("Unauthorized");
    }

    const parsed = UpdateRequestSchema.safeParse({
        requestId: formData.get("requestId"),
        status: formData.get("status"),
        publishedContentId: formData.get("publishedContentId"),
        hiddenReason: formData.get("hiddenReason"),
        hideRequest: formData.get("hideRequest") || "false",
    });

    if (!parsed.success) {
        throw new Error("Invalid request update.");
    }

    const supabase = getAdminClient();
    const publishedContentId = emptyToNull(parsed.data.publishedContentId);

    const { error } = await (supabase as any).from("content_requests")
        .update({
            status: parsed.data.status,
            published_content_id: publishedContentId,
            hidden_at: parsed.data.hideRequest === "true" ? new Date().toISOString() : null,
            hidden_reason: parsed.data.hideRequest === "true" ? emptyToNull(parsed.data.hiddenReason) : null,
        })
        .eq("id", parsed.data.requestId);

    if (error) {
        console.error("Failed to update content request:", error);
        throw new Error("Failed to update content request.");
    }

    revalidatePath("/requests");
    revalidatePath("/admin");
    revalidatePath("/admin/requests");
}
