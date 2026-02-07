/**
 * Edit Content Page
 * 
 * Edit existing content for Lifebook.
 */

import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { ContentForm } from "@/components/admin/ContentForm";
import { Segment } from "@/types/database";

interface EditContentPageProps {
    params: Promise<{ id: string }>;
}

export default async function EditContentPage({ params }: EditContentPageProps) {
    const { id } = await params;
    const supabase = getAdminClient();

    // Fetch content with segments and artifacts
    const { data: contentItem, error } = await supabase
        .from("content_item")
        .select(`
            *,
            segments:segment(id, order_index, title, markdown_body, start_time_sec, end_time_sec),
            artifacts:artifact(id, type, payload_schema)
        `)
        .eq("id", id)
        .order("order_index", { referencedTable: "segment" })
        .single();

    if (error || !contentItem) {
        notFound();
    }

    // Transform data for the form
    const formData = {
        id: contentItem.id,
        title: contentItem.title,
        author: contentItem.author || "",
        type: contentItem.type as "podcast" | "book" | "article",
        category: contentItem.category || "",
        source_url: contentItem.source_url || "",
        cover_image_url: contentItem.cover_image_url || "",
        duration_seconds: contentItem.duration_seconds,
        status: contentItem.status as "draft" | "verified",
        is_featured: contentItem.is_featured,
        quick_mode_json: contentItem.quick_mode_json as {
            hook: string;
            big_idea: string;
            key_takeaways: string[];
        } | null,
        segments: ((contentItem as any).segments || []).map((seg: Segment) => ({
            id: seg.id,
            order_index: seg.order_index,
            title: seg.title || "",
            markdown_body: seg.markdown_body,
            start_time_sec: seg.start_time_sec || undefined,
            end_time_sec: seg.end_time_sec || undefined,
        })),
        artifacts: ((contentItem as any).artifacts || []).map((artifact: any) => ({
            id: artifact.id,
            type: artifact.type as "checklist",
            payload_schema: artifact.payload_schema,
        })),
    };


    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-zinc-900">Edit Content</h1>
                <p className="text-zinc-500 mt-1">
                    Update the content for &quot;{contentItem.title}&quot;
                </p>
            </div>

            <ContentForm initialData={formData} isEditing />
        </div>
    );
}
