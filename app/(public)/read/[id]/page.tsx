/**
 * Public Reader Page
 * 
 * Full content reader view.
 * Public access - no authentication required.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { ReaderView } from "@/components/reader/ReaderView";
import type { ContentItemWithSegments, SegmentFull, ArtifactSummary, QuickMode } from "@/types/domain";
import { APP_NAME } from "@/lib/brand";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";


interface PageProps {
    params: Promise<{ id: string }>;
}

export const revalidate = 300;

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
        (data.author ? `${data.author} · ${data.category ?? "Reading"}` : data.category ?? "Read on NETFLUX");
    const ogImage = data.cover_image_url ?? `${siteUrl}/images/og-image.png`;

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            url: `${siteUrl}/read/${id}`,
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

export default async function ReadPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = createPublicServerClient();

    // Fetch content with segments and artifacts
    const { data: content, error } = await supabase
        .from("content_item")
        .select(`
            id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, category, audio_url,
            segments:segment(id, item_id, order_index, title, markdown_body, start_time_sec, end_time_sec, deleted_at),
            artifacts:artifact(id, type, payload_schema, version)
        `)
        .eq("id", id)
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("order_index", { referencedTable: "segment", ascending: true })
        .single();

    if (error || !content) {
        notFound();
    }

    // Check Session - removed as not used
    // const { data: { user } } = await supabase.auth.getUser();

    // Transform to domain type
    const contentAny = content as any;
    const item: ContentItemWithSegments = {
        id: contentAny.id,
        type: contentAny.type,
        title: contentAny.title,
        source_url: contentAny.source_url,
        status: contentAny.status,
        category: contentAny.category || null,
        quick_mode_json: contentAny.quick_mode_json as QuickMode | null,
        duration_seconds: contentAny.duration_seconds,
        author: contentAny.author,
        cover_image_url: contentAny.cover_image_url,
        audio_url: contentAny.audio_url || null,
        segments: (contentAny.segments as any[])
            .filter(s => !s.deleted_at) // Filter out soft-deleted segments
            .sort((a, b) => a.order_index - b.order_index) // Ensure correct order
            .map(s => ({
                id: s.id,
                item_id: s.item_id,
                order_index: s.order_index,
                title: s.title,
                markdown_body: s.markdown_body,
                start_time_sec: s.start_time_sec,
                end_time_sec: s.end_time_sec
            })) as SegmentFull[],
        artifacts: (contentAny.artifacts as any[]) as ArtifactSummary[],
    };

    // Gate removed - allow guest access

    return <ReaderView content={item} />;
}
