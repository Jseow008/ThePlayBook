import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContentPreview } from "@/components/ui/ContentPreview";
import type { ContentItem } from "@/types/database";

export const revalidate = 60;

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function PreviewPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("content_item")
        .select("*")
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

