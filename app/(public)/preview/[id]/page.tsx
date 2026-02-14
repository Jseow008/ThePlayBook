import { notFound } from "next/navigation";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { ContentPreview } from "@/components/ui/ContentPreview";
import type { ContentItem } from "@/types/database";

export const revalidate = 300;

const PREVIEW_SELECT = "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, category, created_at";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function PreviewPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = createPublicServerClient();

    const { data, error } = await supabase
        .from("content_item")
        .select(PREVIEW_SELECT)
        .eq("id", id)
        .eq("status", "verified")
        .is("deleted_at", null)
        .single();

    if (error || !data) {
        notFound();
    }

    const { count: segmentCount } = await supabase
        .from("segment")
        .select("*", { count: "exact", head: true })
        .eq("item_id", id)
        .is("deleted_at", null);

    return (
        <ContentPreview
            item={data as ContentItem}
            segmentCount={segmentCount}
        />
    );
}

