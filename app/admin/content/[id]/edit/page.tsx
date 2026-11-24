/**
 * Edit Content Page
 * 
 * Edit existing content for {APP_NAME}.
 */

import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { fetchPublishedContentOptions } from "@/lib/server/content-requests";
import { ContentVersionActions } from "@/components/admin/ContentVersionActions";
import { ReplaceContentPanel } from "@/components/admin/ReplaceContentPanel";
import { ContentContributors } from "@/components/admin/ContentContributors";
import { isContributorRole } from "@/lib/content-contributors";
import { ContentForm } from "@/components/admin/ContentForm";
import { getAdminSeriesOptions } from "@/lib/server/admin-series";
import { getAdminAiReadinessMap } from "@/lib/server/admin-ai-readiness";
import { toNarrationEstimate } from "@/lib/server/narration-estimate";
import { Segment } from "@/types/database";
import { getNarrationJobState } from "@/lib/narration-job";

interface EditContentPageProps {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ returnTo?: string }>;
}

export default async function EditContentPage({ params, searchParams }: EditContentPageProps) {
    const { id } = await params;
    const resolvedSearchParams = await searchParams;
    const supabase = getAdminClient();

    // Fetch content with segments and artifacts
    const [seriesOptions, { data: contentItemRaw, error }, replacementOptions] = await Promise.all([
        getAdminSeriesOptions(),
        supabase
        .from("content_item")
        .select(`
            *,
            segments:segment(id, order_index, title, markdown_body, deleted_at, start_time_sec, end_time_sec),
            artifacts:artifact(id, type, payload_schema)
        `)
        .eq("id", id)
        .is("deleted_at", null)
        .order("order_index", { referencedTable: "segment" })
        .single(),
        fetchPublishedContentOptions(),
    ]);

    if (error || !contentItemRaw) {
        notFound();
    }

    const contentItem = contentItemRaw as any;
    const [highlights, reflections, credits] = await Promise.all([
        supabase.from("user_highlights").select("id", { count: "exact", head: true }).eq("content_item_id", id),
        supabase.from("user_reflections").select("id", { count: "exact", head: true }).eq("content_item_id", id),
        supabase.from("content_contributor").select("id, name, role, is_default_speaker").eq("content_item_id", id).order("position"),
    ]);
    if (credits.error) throw credits.error;
    const contributors = (credits.data ?? []).flatMap((credit) =>
        isContributorRole(credit.role) ? [{ ...credit, role: credit.role }] : []);
    if (highlights.error || reflections.error) throw highlights.error || reflections.error;
    const hasAnnotations = (highlights.count ?? 0) > 0 || (reflections.count ?? 0) > 0;
    const narrationJob = getNarrationJobState({
        audio_url: contentItem.audio_url,
        narration_status: contentItem.narration_status,
        narration_error: contentItem.narration_error,
        narration_requested_at: contentItem.narration_requested_at,
        narration_started_at: contentItem.narration_started_at,
        narration_completed_at: contentItem.narration_completed_at,
    });
    const aiReadinessById = await getAdminAiReadinessMap(supabase as any, [{
        id: contentItem.id,
        status: contentItem.status,
        embedding: contentItem.embedding,
    }]);
    const narrationEstimate = toNarrationEstimate(contentItem);

    // Transform data for the form
    const formData = {
        id: contentItem.id,
        source_updated_at: contentItem.updated_at,
        title: contentItem.title,
        author: contentItem.author || "",
        type: contentItem.type as "podcast" | "book" | "article" | "video",
        category: contentItem.category || "",
        source_url: contentItem.source_url || "",
        cover_image_url: contentItem.cover_image_url || "",
        hero_image_url: contentItem.hero_image_url || "",
        audio_url: narrationJob.audio_url || "",
        narration_status: narrationJob.status,
        narration_error: narrationJob.error,
        narration_requested_at: narrationJob.requested_at,
        narration_started_at: narrationJob.started_at,
        narration_completed_at: narrationJob.completed_at,
        series_id: contentItem.series_id || "",
        series_order: contentItem.series_order ?? null,
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
            start_time_sec: seg.start_time_sec ?? undefined,
            end_time_sec: seg.end_time_sec ?? undefined,
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

            {hasAnnotations && <ContentVersionActions key={id} mode="create" contentId={id} updatedAt={contentItem.updated_at} />}
            {!hasAnnotations && <p className="text-sm text-zinc-600">This summary has no highlights or notes. Saving revisions updates this record directly. Annotations are checked again when you save.</p>}
            {!contentItem.update_source_id && <ReplaceContentPanel contentId={id} options={replacementOptions} />}

            <ContentForm
                key={id}
                initialData={formData}
                isEditing
                isVersionDraft={Boolean(contentItem.update_source_id) && !contentItem.published_at}
                seriesOptions={seriesOptions}
                aiReadiness={aiReadinessById[contentItem.id]}
                narrationEstimate={narrationEstimate}
                returnTo={resolvedSearchParams?.returnTo}
            />
            <ContentContributors key={id + "-contributors"} contentId={id} initial={contributors} />
        </div>
    );
}
