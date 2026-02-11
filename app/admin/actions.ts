"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { verifyAdminSession } from "@/lib/admin/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ToggleFeaturedStatusSchema = z.object({
    contentId: z.string().uuid(),
    currentStatus: z.boolean(),
});

export async function toggleFeaturedStatus(contentId: string, currentStatus: boolean): Promise<{ success: boolean; error?: string }> {
    const parsed = ToggleFeaturedStatusSchema.safeParse({ contentId, currentStatus });
    if (!parsed.success) {
        return { success: false, error: "Invalid request payload." };
    }

    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return { success: false, error: "Unauthorized" };
    }

    try {
        const supabase = getAdminClient();
        const { contentId: validContentId, currentStatus: validCurrentStatus } = parsed.data;

        const { error } = await (supabase
            .from("content_item") as any)
            .update({ is_featured: !validCurrentStatus })
            .eq("id", validContentId)
            .is("deleted_at", null);

        if (error) {
            console.error("Supabase update error:", error);
            return { success: false, error: error.message };
        }

        revalidatePath("/admin");
        revalidatePath(`/admin/content/${validContentId}/edit`);
        revalidatePath("/"); // Also update homepage to show changes immediately
        return { success: true };
    } catch (error) {
        console.error("Server action error:", error);
        return { success: false, error: "Internal server error" };
    }
}
