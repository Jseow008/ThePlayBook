import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { ContentPreview } from "@/components/ui/ContentPreview";
import type { ContentItem } from "@/types/database";
import { APP_NAME } from "@/lib/brand";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";


export const revalidate = 300;

const PREVIEW_SELECT = "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, category, created_at";

interface PageProps {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const supabase = createPublicServerClient();

    const { data } = await supabase
        .from("content_item")
        .select("title, author, category, cover_image_url, quick_mode_json")
        .eq("id", id)
        .eq("status", "verified")
        .is("deleted_at", null)
        .single();

    if (!data) return {};

    const title = `${data.title} — ${APP_NAME}`;
    const quickMode = data.quick_mode_json as { big_idea?: string } | null;
    const description =
        quickMode?.big_idea ??
        (data.author ? `${data.author} · ${data.category ?? "Preview"}` : data.category ?? "Preview on NETFLUX");
    const ogImage = data.cover_image_url ?? `${siteUrl}/images/og-image.png`;

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            url: `${siteUrl}/preview/${id}`,
            images: [{ url: ogImage, width: 1200, height: 630, alt: data.title }],
            type: "article",
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [ogImage],
        },
    };
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

