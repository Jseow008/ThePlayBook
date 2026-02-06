"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function toggleFeaturedStatus(contentId: string, currentStatus: boolean): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = getAdminClient();

        // Use 'as any' to bypass the 'never' type inference issue
        const { error } = await (supabase
            .from("content_item") as any)
            .update({ is_featured: !currentStatus })
            .eq("id", contentId);

        if (error) {
            console.error("Supabase update error:", error);
            return { success: false, error: error.message };
        }

        revalidatePath("/admin");
        revalidatePath(`/admin/content/${contentId}/edit`);
        revalidatePath("/"); // Also update homepage to show changes immediately
        return { success: true };
    } catch (error) {
        console.error("Server action error:", error);
        return { success: false, error: "Internal server error" };
    }
}
