"use server";

import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { CONTRIBUTOR_ROLES } from "@/lib/content-contributors";
import { revalidateReaderContent } from "@/lib/server/revalidation";
import { getAdminClient } from "@/lib/supabase/admin";

const contributorsSchema = z.array(z.object({
    name: z.string().trim().min(1).max(200),
    role: z.enum(CONTRIBUTOR_ROLES),
    is_default_speaker: z.boolean(),
})).max(100).refine((contributors) =>
    contributors.filter((person) => person.is_default_speaker).length <= 1);

export async function saveContentContributors(
    contentId: string,
    _previous: { status: "idle" | "saved" | "error"; message?: string },
    formData: FormData,
): Promise<{ status: "saved" | "error"; message: string }> {
    if (!await verifyAdminSession()) return { status: "error", message: "Sign in as an admin to save contributors." };
    const input = formData.get("contributors");
    let rows: unknown;
    if (typeof input === "string" && input.length <= 100_000) {
        try { rows = JSON.parse(input); } catch { /* The schema rejects invalid input. */ }
    }
    const parsed = contributorsSchema.safeParse(rows);
    if (!z.guid().safeParse(contentId).success || !parsed.success) {
        return { status: "error", message: "Enter a name and role for each contributor and choose at most one speaker." };
    }
    const { error } = await getAdminClient().rpc("replace_content_contributors", {
        p_content_id: contentId,
        p_contributors: parsed.data,
    });
    if (error) return { status: "error", message: "Contributors could not be saved. Try again." };
    revalidateReaderContent(contentId);
    return { status: "saved", message: "Contributors saved." };
}
